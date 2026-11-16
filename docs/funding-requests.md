# Deposits and withdrawals

Before publishing the updated web app, apply the database migration
`20261116120000_manual_funding_requests.sql`.

The web app calls authenticated database functions directly. Redeploy
`create-manual-deposit` as well if older clients still use that Edge Function;
it now delegates to the same request function.

In the CRM, open a client and select **Deposits & withdrawals**:

- Review pending deposits and withdrawals using **Approve** or **Reject**.
  A review note is required and saved in the audit log. Approve deposits after
  confirming receipt of payment. Arrange a withdrawal payout manually before
  marking it approved; the app does not send bank or blockchain payments.
- Under **Deposit payment instructions**, select BTC, crypto or bank and choose
  **This client only** or **All clients in this company**. Enter the destination
  and any additional instructions, then save. Client instructions override the
  shared instructions for that method. **Use shared instructions** removes an
  override. Existing client bank details remain available as a fallback.

Clients choose a method and amount in their wallet. BTC requests use BTC and
credit the BTC balance after approval. Crypto and bank requests use EUR or USD
and credit the selected account currency after approval. Every request starts
pending; retries of the same deposit submission cannot create duplicate credits.
Current payment instructions refresh automatically. Each deposit also retains
the instructions present at submission for audit purposes.

EUR, USD and BTC withdrawals reserve funds when submitted. Approval keeps the
reservation as the final debit; rejection returns the exact amount reserved.
Repeated review actions cannot apply the same credit or refund twice. Clients
cannot approve, rewrite or delete their own funding requests.

Run `npm run test:crm-statuses` for database integration checks, including funding
submission, approval, rejection, permissions, instruction scope and ledger effects.
