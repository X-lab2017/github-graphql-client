import { GitHubClient } from '../src';

// set timeout to 30s to fit network
jest.setTimeout(30000);

const token: string = '6281cb1e503c544deec88d5b80131e4dbc5945aa';

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
      tokens: [token]
    });
    expect(client.query(``, {})).
      rejects.toEqual(new Error('Client not inited yet! Call `await client.init()` to init.'));
  });

  it('Query not exist resources', async () => {
    const client = new GitHubClient({
      tokens: [token]
    });
    await client.init();
    const query = `query {
        repository(owner: "openx-lab", name:"not-gonna-exist") {
          name
        }
      }`;
    const ret = await client.query(query, {});
    expect(ret).toBeNull();
  });

  it('Query a current resource with variables', async () => {
    const client = new GitHubClient({
      tokens: [token]
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
      repository: {
        owner: {
          login: owner,
          __typename: 'Organization'
        },
        name,
        createdAt: '2019-09-03T13:32:52Z'
      }
    };
    const ret = await client.query(query, { owner, name });
    expect(ret).toMatchObject(expectData);
  });
});
