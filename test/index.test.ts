/* Copyright 2019 ZhaoShengyu
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 *    http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import nock from 'nock';
import { GitHubClient } from '../src';

// set timeout to 30s to fit network
jest.setTimeout(30000);

const mockData = (response: any, status: number = 200) => {
  nock('https://api.github.com').post('/graphql').reply(status, response);
};

describe('GitHub GraphQL Client', () => {
  it('is a class', () => {
    expect(GitHubClient).toBeInstanceOf(Object);
  });

  it('Not accept empty token array', () => {
    expect(() => {
      const client = new GitHubClient({
        tokens: []
      });
      client.init();
    }).toThrow();
  });

  it('Should call init before query', () => {
    const client = new GitHubClient({
      tokens: ['secrect123']
    });
    expect(client.query(``, {})).
      rejects.toEqual(new Error('Client not inited yet! Call `await client.init()` to init.'));
  });

  it('Query not exist resources', async () => {
    const client = new GitHubClient({
      tokens: ['secret123']
    });
    mockData({
      data: {
        rateLimit: {
          remaining: 5000,
          resetAt: new Date().getTime() + 10000
        }
      }
    });
    await client.init();
    const query = `query {
        repository(owner: "openx-lab", name:"not-gonna-exist") {
          name
        }
      }`;
    mockData({
      data: {
        repository: null
      },
      errors: [
        {
          type: 'NOT_FOUND',
          path: [
            'repository'
          ],
          locations: [
            {
              line: 7,
              column: 3
            }
          ],
          message: 'Could not resolve to a Repository with the name \'not-gonna-exist\'.'
        }
      ]
    });
    const ret = await client.query(query, {});
    expect(ret).toBeNull();
  });

  it('Query a current resource with variables', async () => {
    const client = new GitHubClient({
      tokens: ['secret123']
    });
    mockData({
      data: {
        rateLimit: {
          remaining: 5000,
          resetAt: new Date().getTime() + 10000
        }
      }
    });
    await client.init();
    const owner = 'openx-lab';
    const name = 'github-graphql-client';
    const query = `query RepoInfo($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          owner {
            login
            __typename
          }
          name
          createdAt
        }
      }`;
    const expectData = {
      data: {
        rateLimit: {
          remaining: 5000,
          resetAt: new Date().getTime() + 10000
        },
        repository: {
          owner: {
            login: owner,
            __typename: 'Organization'
          },
          name,
          createdAt: '2019-09-03T13:32:52Z'
        }
      }
    };
    mockData(expectData);
    const ret = await client.query(query, { owner, name });
    expect(ret).toMatchObject(expectData.data);
  });
});
