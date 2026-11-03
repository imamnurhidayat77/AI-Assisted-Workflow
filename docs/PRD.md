Product Requirements Document
Street Smart Copilot
An AI-assisted internal workflow and knowledge copilot for Smart City Streets Ltd

Field	Value
Version	1.0 Draft
Status	Implementation-aligned PRD
Owner	Imam Nurhidayat
Target Stack	Next.js + Express + PostgreSQL
Related Repo	AI-Assisted-Workflow
Inspiration	SAP Joule-style enterprise copilot
1. Product Summary
Street Smart Copilot is a role-aware internal AI assistant that helps employees across Operations, Finance, Sales, HR, and Management access company knowledge, retrieve grounded answers from internal data, and accelerate approval-driven workflows.

The product combines:

Conversational AI
Grounded retrieval from structured business data
Document search and summarisation
Drafting and approval workflows
Role-based access and auditability
This is not a general chatbot. It is an internal company copilot that only answers using approved company data sources and only performs actions through controlled, auditable workflows.

2. Product Vision
Build a secure internal AI copilot that gives staff a single place to:

ask questions about company operations and records,
find relevant internal documents and business context,
generate workflow drafts and recommendations,
and route decisions through human approval.
Positioning statement:

Street Smart Copilot is the internal AI layer over company data and workflow, designed to reduce time spent searching, summarising, drafting, and coordinating decisions across departments.

3. Problem Statement
Employees currently spend too much time:

searching across fragmented systems, spreadsheets, and documents,
manually summarising information for reporting or handover,
drafting repetitive outputs such as quotes, approvals, and responses,
checking status across departments,
and chasing context from colleagues instead of retrieving it directly.
Typical issues include:

Knowledge fragmentation
Information is scattered across operational records, finance data, HR policies, tender records, and documents.

Slow internal response loops
Managers and staff rely on manual coordination for routine status queries and approvals.

Document retrieval friction
Policies, specifications, contract materials, and prior responses are difficult to locate quickly.

Repetitive drafting work
Teams repeatedly draft similar content such as summaries, follow-ups, approval notes, and business responses.

Risk of ungoverned AI usage
General-purpose AI tools are not grounded in company data and may expose confidentiality or produce untrusted output.

4. Product Goals
Primary Goals
Provide a single AI interface for internal company knowledge access.
Ensure all answers are grounded in approved data sources.
Accelerate routine workflows using draft + approval patterns.
Enforce role-based access boundaries across departments.
Maintain a full audit trail of AI usage and workflow decisions.
Secondary Goals
Improve cross-functional visibility without exposing restricted data.
Reduce time spent on repetitive drafting and summarisation.
Establish a reusable architecture for future integrations and automation.
5. Non-Goals
The following are explicitly out of scope for the current product phase:

Full ERP replacement
Autonomous execution without human review
Direct unrestricted text-to-SQL
Advanced BI dashboard replacement
Payroll or sensitive HR processing automation
External customer-facing AI
Production-grade SSO and enterprise IAM in the first prototype
Full workflow orchestration for every department
The current product is a controlled internal copilot, not a full business system replacement.

6. Target Users
The product supports five primary user roles.

6.1 Operations
Typical needs:

query job/workflow status,
check deadlines and operational summaries,
retrieve process-related documents,
review or act on draft operational decisions.
6.2 Finance
Typical needs:

review invoice status and finance summaries,
inspect aged receivables and close-check items,
retrieve finance-related documents,
draft finance-related internal outputs.
6.3 Sales
Typical needs:

review tender, quotation, and distributor sales context,
retrieve supporting product or commercial information,
draft responses and commercial materials,
manage follow-up knowledge efficiently.
6.4 HR
Typical needs:

access HR policy information,
review safe aggregate HR records,
draft HR-related reminders or summaries,
answer common internal policy questions.
6.5 Management
Typical needs:

get cross-functional summaries,
review performance signals across departments,
inspect pending approvals and decision queues,
generate management-ready summaries and reports.
7. Core Product Principles
Role-aware by design
Access is determined by authenticated role, not user prompt wording.

Grounded answers only
The assistant must answer from approved business data, retrieved documents, or known workflow records.

Human approval for meaningful actions
Drafting and recommendations are allowed; consequential actions require explicit confirmation.

Traceable and auditable
Every interaction, answer source, and workflow action should be logged.

No fake runtime fallback
If required data is unavailable, the system must return a clear failure or empty state rather than fabricate results.

Modular capability model
New capabilities should be added as scoped assistants, data tools, or workflow handlers without changing the entire architecture.

8. Functional Scope
8.1 Conversational Copilot Workspace
The system shall provide a central conversation interface where users can:

type natural-language questions,
receive grounded answers,
view sources and context,
continue threads over time,
and switch between approved assistants depending on their role.
Requirements
Support persistent conversations.
Support assistant selection where applicable.
Support role-gated assistant availability.
Show explicit denial when a role is not allowed to use an assistant.
Store messages and metadata for audit and continuity.
8.2 Role-Based Assistant Model
The system shall expose assistants appropriate to the authenticated user’s role.

Requirements
The backend must resolve or validate assistant selection.
Users may only access assistants allowed for their role.
Assistant access must be enforced server-side.
The frontend may display only allowed assistants, but backend enforcement is mandatory.
Notes
This is already consistent with the current repository direction and should remain a core architectural rule.

8.3 Grounded Structured Data Access
The system shall support question answering over structured company data in a controlled manner.

Supported domains in current scope
tenders
invoices
distributor sales
HR policy / safe HR aggregates
jobs / operational workflow records
workflow drafts and approvals
conversation history
documents and extracted content
Requirements
The assistant may answer from structured datasets using validated query generation.
The system must restrict accessible tables and fields by role.
Only safe, read-only query patterns are allowed.
Destructive, unrestricted, or ambiguous queries must be blocked.
When structured data is used, the answer should include data provenance.
8.4 Controlled SQL Exploration
The system shall include a validated query mechanism for safe internal data exploration.

Requirements
Only SELECT queries are allowed.
No destructive statements.
No unrestricted joins unless implemented later via pre-approved views.
Limit clauses must be bounded.
Column and table access must be allowlisted per role.
The system may propose SQL, but execution must pass strict validation.
Product Intention
This feature is not meant to expose raw database access to end users. It is an internal grounding mechanism used by the assistant under policy.

8.5 Document Retrieval and Summarisation
The system shall support grounded answers from uploaded internal documents.

Supported document examples
contracts
HR policies
specifications
internal reports
supporting business documents
Requirements
Documents must be ingestible and chunked for retrieval.
Extracted text must be searchable.
Retrieval should support document domain scoping.
Answers should reference retrieved document context where possible.
The system should summarise retrieved content into usable language.
Future enhancement
citation spans,
page references,
vector search improvements,
hybrid keyword + semantic retrieval.
8.6 Drafting and Approval Workflows
The system shall support AI-assisted draft creation for internal workflows.

Draft examples
approval memo
recommendation note
internal summary
quote or response draft
management brief
checklist-based completion output
Requirements
Drafts must be storable as entities.
Drafts must have ownership and status.
Drafts may require checker/reviewer action.
Users should be able to approve, reject, or revise drafts.
Draft history should remain traceable.
Product intent
This is a key differentiator from a basic chatbot. The assistant should not only answer questions, but also help move internal workflow forward.

8.7 Inbox / Decision Queue
The system shall provide a personal work queue for items that require user action.

Requirements
Show drafts awaiting user decision.
Show drafts created by the user that need follow-up.
Filter items based on ownership and reviewer role.
Support approval and rejection actions.
Maintain decision audit history.
8.8 Spaces / Persistent Work Context
The system shall support persistent workspaces or spaces to organise related work artifacts.

Requirements
Users may create or access spaces relevant to their work.
Spaces may contain related items, drafts, documents, or references.
Space visibility should respect role and ownership rules.
Note
This is useful for longer-running work beyond one-off chat exchanges.

8.9 Department Views
The system shall provide role-relevant views or landing experiences for different user groups.

Examples
Sales-oriented discovery prompts
Finance close or receivables context
HR policy and aggregate queries
Operations status and jobs
Management overview and decision support
Requirement
The product should feel like one platform with different role-relevant entry points, not separate siloed apps.

8.10 Audit and Usage Logging
The system shall log AI interactions and workflow actions for traceability.

Requirements
Log authenticated user identity
Log assistant used
Log request preview or metadata
Log response preview or metadata
Log approval decisions
Log failed access attempts where appropriate
Avoid storing unnecessary sensitive raw content when not needed
9. User Experience Requirements
9.1 Conversation Page
The conversation experience should:

feel like a professional internal copilot workspace,
support multi-turn interaction,
present structured answers cleanly,
display sources,
render document-like outputs clearly,
and surface draft/action results naturally.
9.2 Empty and Error States
The UI must prefer honesty over simulation.

Requirements
If the backend is unavailable, show clear failure states.
If no data is available, show an explicit empty state.
Do not display fake or fallback runtime data as if it were real.
9.3 Assistant Selection
The user should be able to:

see which assistants are available,
understand if an assistant is unavailable due to role restrictions,
and rely on backend enforcement for final access control.
9.4 Draft Presentation
Draft outputs should be rendered in a more document-like structured format when applicable:

numbered sections,
paragraphs,
bullets,
tables,
footer or approval metadata.
This aligns with the current frontend direction.

10. System Behavior Requirements
10.1 Request Handling
When a user submits a message:

authenticate the user,
determine or validate assistant selection,
enforce role permissions,
determine whether the request requires structured data, document retrieval, workflow context, or a combination,
generate a grounded answer,
store the conversation exchange,
record audit metadata.
10.2 Permission Enforcement
Permission checks must happen:

in assistant access,
in structured data access,
in document scope filtering,
in draft ownership/reviewer actions.
10.3 Failure Handling
If grounding fails:

the system should return a clear error or constrained fallback response,
but must not invent authoritative business facts.
11. Data Requirements
The current product direction implies the following major entity groups.

11.1 Identity and Access
AppUser
API keys or session credentials
role definitions
11.2 Conversations
Conversation
Message
11.3 Documents
Document
DocumentChunk
11.4 Workflow and Drafting
Draft
approval/checker metadata
space-linked workflow items
11.5 Business Data
Tender
Invoice
DistributorSale
HR policy / leave aggregate records
Job / operations records
close-check items
optional supporting entity tables
11.6 Audit
Chat audit
access and usage logs
The exact schema can evolve, but these domains define the expected product surface.

12. Security and Access Requirements
All sensitive access must be authenticated.
Role enforcement must be server-side.
SQL execution must be validated and constrained.
Document retrieval must respect domain restrictions.
Audit should capture usage without over-retaining unnecessary sensitive text.
The system must not expose raw internal data outside the authenticated UI context.
Actions with business impact must remain approval-based.
13. Technical Requirements
13.1 Stack
Frontend: Next.js
Backend: Express with TypeScript
Database: PostgreSQL
ORM: Prisma
AI Layer: provider-based LLM integration
Retrieval: extracted document text plus vector or chunk retrieval
13.2 Architecture
The architecture should remain modular:

apps/web for UI
apps/api for business logic and AI orchestration
shared package for roles, assistant definitions, and common types
Prisma schema for core data model
13.3 Deployment Principle
The system must work against a real configured database.
If the database or dependent service is unavailable, the app must fail clearly rather than pretend to succeed.

14. MVP Scope
The MVP should demonstrate the product as a secure internal AI copilot, not as a broad unfinished platform.

MVP includes
role-based login/demo access
conversation UI
assistant gating by role
grounded answers from structured data
validated SQL-based internal retrieval
document retrieval and summarisation
draft creation and approval flow
conversation persistence
audit logging
inbox/decision queue
MVP excludes
external-facing workflows
production-grade SSO
unrestricted analytics
deep automation chains
multi-tenant support
complex joins across arbitrary datasets unless modelled as approved views
15. Success Metrics
Usage Metrics
% of users who complete at least one successful grounded query
number of conversations per role
number of document retrieval actions
number of drafts created and reviewed
Efficiency Metrics
reduction in time to retrieve internal information
reduction in time to prepare standard internal summaries or drafts
reduction in manual coordination for routine status questions
Quality Metrics
grounded-answer success rate
invalid query rejection rate
user approval rate for AI-generated drafts
user feedback score on usefulness and trust
Safety Metrics
zero unauthorized assistant access
zero destructive SQL execution
zero fabricated data presented as authoritative
16. Risks and Mitigations
Risk	Mitigation
Product feels like multiple tools rather than one copilot	Keep a unified copilot narrative: ask, find, draft, approve
AI answers become inconsistent across domains	Use grounded retrieval paths and assistant scoping
Users expect full automation	Position the product as assistive, approval-based workflow support
SQL exploration becomes unsafe	Maintain strict validator and allowlists
Documents expose cross-domain data	Apply document domain scoping and role checks
Prototype appears fake if data is unavailable	Keep explicit empty/error states and avoid runtime fake fallback
Scope grows too broad across departments	Prioritise the strongest 3 cross-functional use cases for demos
17. Priority Use Cases for Demonstration
To keep the product story coherent, demos should focus on three primary workflows.

Use Case 1 — Operations Knowledge and Action Support
User asks about operational status or job context and receives a grounded answer with relevant next-step draft support.

Use Case 2 — Finance Review and Internal Summary
User asks about invoice or close-related status and receives a grounded summary with structured output.

Use Case 3 — Management Cross-Functional Briefing
User asks for a cross-domain summary and receives a decision-support response grounded in business records and documents.

HR and Sales can be shown as supporting role extensions rather than the core product pitch.

18. Future Roadmap
Phase 2
stronger citation UX
richer assistant orchestration
approval notifications
better document metadata extraction
approved SQL views for multi-table analysis
Phase 3
SSO integration
external system connectors
advanced reporting packs
workflow templates per department
action cards with parameter editing and confirmation states
19. Acceptance Criteria for Current Product Phase
The product phase is considered successful if:

A user can log in and access only assistants allowed for their role.
A user can ask a grounded business question and receive a role-safe answer.
The system can retrieve and summarise relevant document content.
The system can create and persist workflow-related drafts.
Decision items can be surfaced in an inbox and acted on.
All key interactions are auditable.
The system fails honestly when data dependencies are unavailable.
20. Implementation Guidance for Coding Agent
The coding agent should treat the current repository as a modular internal AI platform, and prioritize consistency over feature sprawl.

Implementation priorities
Preserve strict role-based access
Preserve grounded-only answer behavior
Keep SQL validation conservative
Strengthen the draft/approval experience
Keep UI messaging honest and professional
Reduce product-language fragmentation across pages
Product language to standardize
Use:

“copilot”
“grounded answer”
“sources”
“draft”
“approval”
“role-based access”
“internal workflow”
Avoid over-emphasizing any one narrow domain like only tenders or only sales unless the page is intentionally role-specific.

Refactoring guidance
The coding agent should gradually align all surfaces to this product model:

one copilot,
multiple grounded data paths,
approval-driven workflow support.