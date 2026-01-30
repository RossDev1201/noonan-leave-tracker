# Noonan Leave Tracker (JSON + API)

Simple Next.js leave tracker for Noonan employees.

- Data source: `data/employees.json` (no database).
- Accrual: **0.83 day per full month** from hire date (carryover every year).
- Eligibility: employee can only **use** leave after **6 full months** of tenure.
- When Sheehan records leave in the UI, the app:
  - writes to `data/employees.json` on the server
  - recomputes all balances
  - updates the front end

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Open your browser at:

- http://localhost:3000

## Updating Employees Manually

Edit `data/employees.json` to add or update employees.

Example entry:

```json
{
  "id": "N002",
  "fullName": "Juan Dela Cruz",
  "position": "Graphic Designer / Content Creator",
  "hireDate": "2025-05-26",
  "startingBalance": 0,
  "leaveTaken": []
}
```

Fields:

- `hireDate` must be `YYYY-MM-DD`.
- `startingBalance` is an optional initial credit (normally `0`).
- `leaveTaken` contains leave records with `date`, `days`, `type`, and optional `note`.

## Using the Front-end to Record Leave

For each employee, the main table shows:

- Accrued (total)
- Taken (total)
- Balance
- Eligibility (Eligible / Not eligible yet)

To record leave for someone (e.g. Juan Dela Cruz):

1. Go to their row in the table.
2. In `Record Leave`:
   - Set `Date` (e.g. 2026-01-15)
   - Set `Days` (e.g. `1` or `0.5`)
   - Choose `Type` (Annual, Sick, Unpaid, Other)
   - Enter a reason in `Reason / note` (optional)
3. Click **Add Leave**.
4. The app will:
   - Append the leave entry to `data/employees.json`
   - Recalculate balances
   - Show the updated remaining leave.

## Build & Deploy

Build for production:

```bash
npm run build
npm start
```

You can deploy this project to any Node-capable host (e.g. Vercel). The API routes use the filesystem (`data/employees.json`), so make sure your host supports writing to disk or adapt it to use a persistent volume.
