import { graphql } from '@octokit/graphql';
import Logger = require('bunyan');
import waitFor = require('p-wait-for');

interface Token {
  // token for this connection
  token: string;
  // connection rate limit remaining
  ratelimitRemaining: number;
  // connection rate limit reset time
  ratelimitReset: number;
}

interface ClientOption {
  tokens: string[];
  logger?: Logger;
  maxConcurrentReqNumber?: number;
  filterStatusCode?: number[];
  maxRetryTimes?: number;
}

export class GitHubClient {

  private tokens: Token[] = [];
  private maxConcurrentReqNumber: number = 10;
  private concurrentReqNumber: number = 0;
  private logger: Logger = Logger.createLogger({
    level: Logger.INFO,
    name: 'GitHub-GraphQL-Client'
  });
  private getConnectionRetryInterval = 10000;
  private filterStatusCode: number[] = [400, 401, 403, 404];
  private requestCostPrediction = 15;
  private maxRetryTimes = 10;

  private inited: boolean;

  constructor(options: ClientOption) {
    if (options.tokens.length === 0) {
      throw new Error('At least one token needed.');
    }
    if (options.logger) {
      this.logger = options.logger;
    }
    if (options.filterStatusCode) {
      this.filterStatusCode = options.filterStatusCode;
    }
    if (options.maxRetryTimes) {
      this.maxRetryTimes = options.maxRetryTimes;
    }
    if (options.maxConcurrentReqNumber) {
      this.maxConcurrentReqNumber = options.maxConcurrentReqNumber;
    }
    this.tokens = options.tokens.map((t: string) => {
      return {
        token: t,
        ratelimitRemaining: -1,
        ratelimitReset: -1
      };
    });
    this.inited = false;
  }

  public async init() {
    await Promise.all(this.tokens.map((token: Token) => this.initToken(token)));
    this.logger.info(`Token inited done, tokens = ${JSON.stringify(this.tokens)}`);
    this.inited = true;
  }

  public async query<TR, T>(q: string, p: T): Promise<TR> {
    if (!this.inited) {
      throw new Error('Client not inited yet! Call `await client.init()` to init.');
    }
    // add rate limit
    const firstBraceIndex = q.indexOf('{') + 1;
    q = q.substr(0, firstBraceIndex) + rateLimitQueryStr + q.substr(firstBraceIndex);
    return this.internalQuery<TR, T>(q, p, 0);
  }

  private resetToken(token: Token) {
    if (this.hasSufficientRemaing(token)) {
      return;
    }
    // add 1s to ensure reset on server side
    let resetTime = new Date(token.ratelimitReset).getTime() - new Date().getTime() + 1000;
    if (resetTime < 0) {
      this.logger.error(`Something wrong with rate limit maintain.`);
      resetTime = 10 * 60 * 1000;
    }
    setTimeout(() => {
      this.initToken(token);
    }, resetTime);
  }

  private async initToken(token: Token) {
    const response: RateLimitResponse = await graphql(rateLimitQuerySql, { headers: { authorization: `token ${token.token}` } }) as any;
    token.ratelimitRemaining = response.rateLimit.remaining;
    token.ratelimitReset = response.rateLimit.resetAt;
    this.resetToken(token);
  }

  // get a valid token
  private async getToken(): Promise<Token> {
    let token: Token;
    await waitFor(() => {
      if (this.concurrentReqNumber >= this.maxConcurrentReqNumber) {
        return false;
      }
      const availableTokens = this.tokens.filter((t: Token) => this.hasSufficientRemaing(t));
      if (availableTokens.length === 0) {
        this.logger.warn(`No avialable token found for now, will try later`);
        return false;
      }
      this.concurrentReqNumber += 1;
      token = availableTokens[Math.floor(Math.random() * availableTokens.length)];
      return true;
    }, {
        interval: this.getConnectionRetryInterval
      });
    return token;
  }

  private hasSufficientRemaing(token: Token): boolean {
    return token.ratelimitRemaining > this.requestCostPrediction * this.maxConcurrentReqNumber;
  }

  // query function
  private async internalQuery<TR, T>(q: string, p: T, retryCount: number): Promise<TR> {
    const token = await this.getToken();
    try {
      // set auth token
      Object.assign(p, { headers: { authorization: `token ${token.token}` } });
      const res: any = (await graphql(q, p));
      const rateLimitRes = res as RateLimitResponse;
      this.concurrentReqNumber--;
      if (!rateLimitRes.rateLimit) {
        this.logger.error(`No rate limit returned for query = ${q}, param = ${JSON.stringify(p)}`);
        process.exit(1);
      }
      token.ratelimitRemaining = rateLimitRes.rateLimit.remaining;
      token.ratelimitReset = rateLimitRes.rateLimit.resetAt;
      this.resetToken(token);
      return res;
    } catch (e) {
      this.logger.error(`Error happened, e = ${JSON.stringify(e)}`);

      this.concurrentReqNumber--;
      let apiRateLimitExceeded = false;
      const response = e as ResponseException;
      if (response.errors) {
        // log error if exists
        if (response.errors.find((e) => e.message.includes('API rate limit exceeded'))) {
          // rate limit exceeded
          this.logger.warn(`Token API rate limit exceeded, token = ${JSON.stringify(token)}`);
          apiRateLimitExceeded = true;
          this.resetToken(token);
        } else if (response.errors.find((e) => e.type && e.type === 'NOT_FOUND')) {
          // not found, maybe deleted
          return null;
        }
      }
      if (retryCount >= this.maxRetryTimes) {
        // retry times exceed the max retry times, return the data no matter there is any
        this.logger.warn(`Retry time exceed max retry times. query = ${q}`);
        return response.data;
      }
      if (apiRateLimitExceeded
        || !response.status
        || (response.status >= 400 && !this.filterStatusCode.includes(response.status))) {
        // api rate limit exceeded
        // no status field
        // status >= 400
        return this.internalQuery<TR, T>(q, p, retryCount + 1);
      } else if (response.data) {
        // other status code, return data if exists
        return response.data;
      }
    }
    return null;
  }
}

interface RateLimitResponse {
  rateLimit: {
    remaining: number;
    resetAt: number;
    cost: number;
  };
}

interface ResponseException {
  name: string;
  status: number;
  errors: Array<{ type: string, message: string }>;
  data: any;
}

const rateLimitQueryStr = `
rateLimit {
    resetAt
    remaining
}
`;

const rateLimitQuerySql = `
query {
    ${rateLimitQueryStr}
}
`;
