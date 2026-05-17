# Pharmacy Feedback System - Project Handover Document

This document contains all the critical information, credentials, architecture details, and an **Agent Initialization Prompt** so that you (or any AI coding assistant like AntiGravity) can easily resume work on this project in the future.

---

## 1. Project Overview
- **Project Name:** Pharmacy Feedback System
- **Purpose:** A complete, mobile-responsive customer feedback system for pharmacy branches with automated email reporting and analytics.
- **Tech Stack:**
  - **Frontend:** Pure HTML5, CSS3 (Vanilla), Vanilla JavaScript. No complex frameworks. Hosted on GitHub Pages.
  - **Backend:** Google Apps Script (Serverless Web App).
  - **Database:** Google Sheets (Feedback and Settings data).
  - **Deployment:** GitHub Pages (Frontend) & Google Apps Script (Backend API).

## 2. Important URLs & Links
- **GitHub Repository:** `https://github.com/Wello-feedback/pharmacy-googlesheet-feedback-app.git`
- **Customer Form (Live):** [https://wello-feedback.github.io/pharmacy-googlesheet-feedback-app/frontend/index.html](https://wello-feedback.github.io/pharmacy-googlesheet-feedback-app/frontend/index.html)
- **Admin Dashboard (Live):** [https://wello-feedback.github.io/pharmacy-googlesheet-feedback-app/frontend/admin.html](https://wello-feedback.github.io/pharmacy-googlesheet-feedback-app/frontend/admin.html)
- **Google Apps Script API URL:** `https://script.google.com/macros/s/AKfycbw318fXXX7UyCiTRb2Ucrn4ulvyiPqWFliBAc1laygM7XAoqTm8Lh-yFeDQ1bzmeODLCg/exec`

## 3. Access Credentials
- **Admin Dashboard Username:** `wello`
- **Admin Dashboard Default Password:** `TerminaL@123!` *(Note: Admin can change this from the profile dropdown on the live site. It is saved in the browser's `localStorage`)*

## 4. File Structure
```text
C:\Users\Sandeep\Desktop\feedback\
│
├── frontend/
│   ├── index.html       (Customer Feedback Form)
│   ├── admin.html       (Admin Dashboard)
│   ├── print-qr.html    (Bulk QR Printing UI)
│   │
│   ├── css/
│   │   ├── customer.css (Styles for customer form)
│   │   └── admin.css    (Styles for admin dashboard)
│   │
│   └── js/
│       ├── customer.js  (Logic for form, star rating, GPS, submission)
│       └── admin.js     (Logic for analytics, branch management, API calls)
│
├── apps_script_final.md (The Google Apps Script code for the backend)
└── PROJECT_HANDOVER.md  (This file)
```

## 5. System Architecture
1. **Frontend-Backend Communication:** The frontend JavaScript (`admin.js`, `customer.js`) makes standard `fetch()` API calls to the Google Apps Script Web App URL.
2. **Backend Logic:** The Google Apps Script acts as the API. It has a `handleRequest` function that routes `GET` and `POST` requests (like `addFeedback`, `getBranches`, `sendReport`) to specific functions.
3. **Database (Sheets):** The data is strictly written to and read from a Google Sheet.
4. **Automated Reports:** Google Apps Script has a Time-Driven Trigger (`setup()` function) that wakes up daily between 8-9 AM. It checks the `Settings` sheet and automatically sends out emails if the criteria (Daily/Weekly/Monthly) is met.

---

## 6. AI Agent Initialization Prompt
**How to use:** If you open a new session with AntiGravity or any other AI Agent, copy the text inside the box below and paste it as your first message. This gives the agent immediate context about the whole project.

```text
Act as a Senior Full-Stack Developer. I need your help to modify my "Pharmacy Feedback System".

Here is the context of the project:
1. **Architecture:** It is a serverless application. The frontend is built with pure HTML/CSS/JS (no React/Node.js). The backend is a Google Apps Script Web App that uses Google Sheets as a database.
2. **Current State:** The code is located in the local folder. The frontend files are in the `/frontend` directory (`admin.html`, `index.html`, `js/admin.js`, `js/customer.js`). The Apps Script backend code is saved as a reference in `apps_script_final.md`.
3. **API URL:** The frontend connects to `https://script.google.com/macros/s/AKfycbw318fXXX7UyCiTRb2Ucrn4ulvyiPqWFliBAc1laygM7XAoqTm8Lh-yFeDQ1bzmeODLCg/exec`.
4. **Deployment:** The frontend is deployed via GitHub Pages from the `main` branch. 

Please review the code in `/frontend` and help me implement the following new requirement:
[INSERT YOUR NEW REQUIREMENT HERE]
```

## 7. Operational Guidelines for Future Edits
- **Frontend Changes:** If you edit `admin.js` or `admin.html`, simply run `git add .`, `git commit -m "update"`, and `git push` to deploy it live to GitHub pages.
- **Backend Changes:** If you modify `apps_script_final.md`, you MUST manually copy the new code, paste it into the Google Apps Script Editor, and create a **New Deployment Version** for the changes to take effect.
- **CORS / Numeric Errors:** Always ensure that data fetched from Google Sheets is cast to `String()` in JavaScript before doing `.replace()` or string operations, as Google Sheets often returns numeric IDs as integers instead of strings.
