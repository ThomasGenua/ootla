# Ask Ootla conversation history

The compact History view opens from the authenticated staff assistant header. It replaces no business workspace and requires no property/context form. New conversation stays in the header, and Back to chat returns to the current conversation. Opening History, cancelling deletion or deleting another conversation preserves the active draft and conversation.

History uses the existing authorized, server-paginated thread service. Titles are escaped text, shown on up to two lines. Entries are grouped by Today, Yesterday and older dates using the resolved user timezone, with short local times rather than seconds or timezone identifiers. No private message preview is added.

## Remove a conversation

Each row has an accessible Delete action. A small inline confirmation explains that this removes the conversation from history. Cancel leaves it intact. Failed removal keeps the row and confirmation available, shows an error and preserves the draft for retry. Successful removal persists on the server and remains absent after a refresh.

Deleting the active conversation returns to a clean new-conversation state. Delayed message/history responses are ignored after removal; new-thread creation invalidates cached History immediately, so a first response still in progress does not prevent selecting its conversation for deletion. The server independently rejects further reads, messages, action confirmations and original create-key replays for a removed thread.

This is history removal, not permanent erasure. An additive deleted_at tombstone preserves required operational/audit evidence under the existing configured retention policy. It does not delete or undo tasks, applications, maintenance requests, customer correspondence or other business records. Configured assistant-content retention remains a separate operation; no retention period is invented. See [operational controls](ootla-operational-controls.md).

## Authorization and concurrency

DELETE /api/ask/threads/:id takes no user or organization identifiers. It uses the current authenticated staff session, exact author/membership/organization and current linked-record permissions. Other users, including another organization administrator, cannot remove someone else's history. The normal origin/CSRF boundary remains enforced. Repeated removal by the same currently authenticated owner is duplicate safe and creates one audit event.

Removal serializes with final replies and confirmed actions on the thread row. A deleted thread cannot release a late assistant answer or become visible through a retry. A business action committed before removal remains its own valid record; an action attempted after removal is rejected. Provider accounting already incurred is retained and settled separately. Client guards also discard delayed successful HTTP responses after active deletion.

## Review locally

Open http://127.0.0.1:7673/admin/maintenance and sign in normally with admin@demo.ootla.test / OotlaDemo!2026 if required. Open the floating Ask Ootla launcher, then History in its header.

1. Open a conversation, type an unsent draft, open History and return to chat. Check the draft remains.
2. Delete another conversation: first Cancel, then confirm. Refresh and reopen History to check it stays removed.
3. Delete the active conversation and check a clean new chat appears. Business records linked from that chat must remain available through their normal pages.
4. On a narrow viewport, check the History list, keyboard focus and confirmation controls.

Focused verification uses isolated fixture databases and controlled responses, without deleting existing demo chats or contacting external providers. Scripts: check-ask-history-provider.ts, check-ask-history-browser.ts/.mjs and check-ask-history-preservation.ts. Detailed outcomes and current deployment commands are recorded in [progress](ootla-progress.md). No provider configuration or activation is part of this refinement.
