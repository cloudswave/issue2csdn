# issue2csdn

GitHub Action which converts GitHub Issue to [CSDN](https://blog.csdn.net/) post.

## Example

[cloudswave/blog](https://github.com/cloudswave/blog)

## Usage

```yml
name: Issue to CSDN
on:
  issues:
    # Sufficient to trigger this workflow when an issue is milestoned
    types: [milestoned]
    # types: [unlabeled, labeled, edited, milestoned]

jobs:
  build:
    runs-on: ubuntu-latest
    if: ${{ github.actor == github.repository_owner }}
    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js 16.x
        uses: actions/setup-node@v2
        with:
          node-version: '16'    
      # use here
      - uses: cloudswave/issue2csdn@main
        with:
          issue_url: ${{ github.event.issue.html_url }}
          token: ${{ secrets.GITHUB_TOKEN }}
          csdn_cookie: ${{ secrets.CSDN_COOKIE }}
          ## optional below
          markdowncontent: |
            ${{ github.event.issue.body }}
            
            _本文同步于个人Github博客：[${{ github.event.issue.html_url }}](${{ github.event.issue.html_url }})，欢迎留言。_
concurrency: 
  group: ${{ github.workflow }}-${{ github.event.issue.number }}
  cancel-in-progress: true   

```

## Action Params

| Key  | Value Information | Type | Required |
| ------------- | ------------- | ------------- | ------------- |
| `token`  | The token to use to access the GitHub API, you can use the ${{ secrets.GITHUB_TOKEN }} | `secrets` | **Yes** |
| `csdn_cookie`  | The cookie after login csdn. see [the guide](https://github.com/cloudswave/blog/issues/6) | `secrets` | **Yes** |
| `issue_url`  | The blog issue link. you can use the ${{ github.event.issue.html_url }} | `env` | **Yes** |
| `markdowncontent`  | The markdowncontent for csdn post, Default the issue content | `env` | **false** |

## Warning
Don't delete the `<!--csdn-article-id:***-->` at the end of the issue content, It is used to update the csdn blog when the issue is updated.
