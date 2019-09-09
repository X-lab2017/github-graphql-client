# GitHub GraphQL Client

[![CircleCI](https://circleci.com/gh/openx-lab/github-graphql-client/tree/master.svg?style=svg)](https://circleci.com/gh/openx-lab/github-graphql-client/tree/master)

This client is used to make [GitHub GraphQL(API v4)](https://developer.github.com/v4) query.

## Requirements

Node.js: ^10.15.3

## Usage

Run `npm install -s github-graphql-client` to install the package.

Demo:
``` TypeScript
import { GitHubClient } from "github-graphql-client";
import Logger = require("bunyan");

let client = new GitHubClient({
    // required
    // multiple token can be passed into the constructor
    // at least one token in the array
    tokens: ["xxx","yyy"],
    // optional
    // the max concurrent request number, may limited by network bandwidth
    // default value: 10
    maxConcurrentReqNumber: 20,
    // optional
    // max retry request time if the query fails
    // default value: 10
    maxRetryTimes: 5,
    // optional
    // return result with these HTTP status code will not retry and fail instantly
    // default value: [400, 401, 403, 404]
    filterStatusCode: [400, 403],
    // optional
    // a bunyan logger instance to log
    // default value: Logger.createLogger({
    //    name: "GitHub-GraphQL-Client",
    //   level: Logger.INFO
    //});
    logger: Logger.createLogger({
        name: "My-Own-Client",
        level: Logger.ERROR
    });
});

// need to call init first to init the token status
await client.init();
let result = await cient.query(query, {});
```

## Features

This client have several features to make sure you have an excellent GraphQL query experience.

### Multiple token management

As GitHub has [rate limit for single token](https://developer.github.com/v4/guides/resource-limitations/), the client supports multiple tokens in constructor options which can break the rate limit and there is no theoratical limitation if you have enough tokens to use.

And the client will automaticly handle the rate limit and reset time for every single token. To achieve this we need to add rate limit query into every query which is also done automaticly so you do not need to add rate limit in your query.

### Concurrent request management

The client can make several calls at same time to speed up massive queies a time. You can set a max concurrent request number in constructor options.

The default max concurrent request number is 10, you may set it to 15 or 20 to speed up your queries. But if you have few tokens and a big max concurrent request number, you may trigger [GitHub API abuse detection](https://developer.github.com/v3/#abuse-rate-limits) which will make your token invalid for a while.

### Error handler

The client will handle any errors occured during a query properly.

If the query hit the token's rate limit, then the token will be invalid until the rate limit is reset, and the query will be retried by another valid token.

If the query returns NOT_FOUDN error which may be caused by fetching data from a deleted repo, the query will return `null`.

If the status code is in `filterStatusCode` array, the query will return any data if exists in the response.

Otherwise, the query will be retried until success or excceed the max retry times.

### Retry handler

The client can take a max retry times option in constructor options whose default value is 10. If a query fails and retry may sovle the problem then the client will retry the query until retry time exceed the max retry times.

It is every important not to set the retry times to positive inifite because some query may always fail if it query too many data in a single query.

## Contributing

Welcome to contribute to this project in any manners.

Please feel free to [open an issue](https://github.com/openx-lab/github-graphql-client/issues/new) if you have any questions or doubts about this project.
