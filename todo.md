
the ralchives
- fuzzy search (+ eventually RAG)
- create thread
- reply to thread

the over-ralph
- impleemntation roadmap breakdown for large fuzzy tasks

setup script that cloens repositories referenced in profiels to config paths

conditionally enhance prompt based on agent type

semantic grouping in prompt similar to copilot?



prompts - agent introduces itself and responds in comments/adothreads with its name and unique emoji


1. Jira Wiki Markup (Via API v2 or Jira Server)
If you want to pass a simple string with basic formatting (like *bold* or [Links|http://example.com]), you can simply switch your curl endpoint from v3 to v2.

Jira Cloud API v2 and Jira Server/Data Center both accept standard JSON strings using Jira Wiki Markup.

Example curl for API v2:

Bash
curl --request POST \
  --url 'https://your-domain.atlassian.net/rest/api/2/issue/ISSUE-123/comment' \
  --header 'Authorization: Basic <YOUR_BASE64_CREDENTIALS>' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data '{
    "body": "This is a standard text comment. I can use *Wiki Markup* here without writing a massive ADF tree."
  }'