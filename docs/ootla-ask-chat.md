# Ask Ootla chat interaction

Open http://127.0.0.1:7673/admin/maintenance, sign in normally if required, and open Ask Ootla at bottom-right. The launcher is available on authenticated staff pages, outside the changing page content. It does not add staff access to applicant or resident portals.

## Reading and sending

The bounded chat keeps its header and message composer outside one scrolling content region. History uses that same region when requested. Optional task fields are associated with the existing message form but remain inside the content region, so expanding them does not create a scrolling composer. Clarification choices use the same content scroll. Mobile viewport changes keep the composer above the keyboard.

Messages retain the server's chronological order. Opening a conversation normally loads its latest page; the same conversation's remembered reading position is preserved when appropriate. Previous messages controls are above the messages. Jump to latest stays near the composer when newer content is outside the reading position. Long complete answers reveal their beginning so they can be read without finding their top manually. Scrolling up or selecting an older page stops automatic following. Closing and reopening preserves the active draft and reading position.

Enter sends a message; Shift+Enter adds a line. Composition/IME input and repeated held keys do not trigger accidental sends. A submitted message appears immediately with a small responding state. The existing transport returns one complete validated JSON response; there is no streaming transport or artificial typing delay. While a send is pending, duplicate sends in that conversation are prevented and a newer draft can still be typed.

## Failures and conversation switching

Failures appear beside the affected turn with Retry message. Retries use the same original payload and request identifier rather than turning a lost acknowledgement into another operation. Task confirmation failures stay beside the task preview and reuse its confirmation identifier. Current backend permissions and duplicate-safe business services remain authoritative.

Opening History, switching conversations or choosing New conversation does not claim server work was cancelled or undone. A delayed answer belongs to its original conversation, and cannot appear in another chat. A completed response remains on the server for a later authorized read. Newer drafts survive earlier responses and retries. Deleted conversations remain blocked by the server and local removed-thread guards; see [History removal](ootla-ask-history.md). Business records remain independent of chat history.

## Quick review

1. Scroll the application down, open Ask Ootla and open an existing conversation. Scroll only its messages, close/reopen, then open History and return. Check the page, draft and reading position remain steady.
2. Send a question using Enter. Use Shift+Enter for a multiline draft. While responding, scroll up; check that a new answer does not pull you down and Jump to latest remains available.
3. Switch to another conversation while a response is pending, then return. The response must stay with its originating thread. Delete an unwanted conversation through the existing confirmation and check it stays absent after refresh.
4. Review and explicitly confirm a supported task proposal once. No task or customer message is sent merely by viewing a proposal or closing the chat. Use isolated records when testing failures/retries.
5. Check the same header/composer, History and keyboard interactions on a narrow viewport.

The current isolated demo intentionally has no live model/key configured. Grounded native record answers remain available. Actual external model verification requires the settings and authorized non-demo environment described in [AI response setup](ootla-ai-response-setup.md). This UI refinement does not activate a provider or require a schema migration. Focused verification and exact current outcomes are recorded in [progress](ootla-progress.md).
