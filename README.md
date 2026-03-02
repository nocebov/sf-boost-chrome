# 🚀 Salesforce Boost (SF Boost)

**Salesforce Boost** is a Chrome Extension designed to eliminate repetitive clicks and supercharge your everyday workflow. Built for Salesforce Administrators, Developers, and Consultants, it seamlessly injects powerful, time-saving tools directly into the Salesforce UI.

---

## ✨ Power Tools

### 1. 🔍 Command Palette (`Alt+Shift+S`)
Stop endless clicking through the Setup menu. Jump anywhere instantly.

* **How it works:** Press `Alt+Shift+S`, type what you need, and hit Enter.
* **What you can find:** 
  * Users, Profiles, Roles, Permission Sets
  * Object Manager, Picklist Value Sets, Fields
  * Flows (type `Find Flow` to instantly search all Flow names!), Process Builders, Approval Processes
  * Apex Classes, Triggers, LWC, Visualforce, Debug Logs
  * **Quick Actions:** Type `Developer Console` to open it instantly.

### 2. 🩻 Field Inspector (`Alt+Shift+F`)
No more digging in the Object Manager just to find a field's API name.

* **How it works:** Press `Alt+Shift+F` (or click the `{ }` button in the bottom-right) on any Record page.
* **What happens:** Blue badges appear next to UI labels displaying the **exact API Name**. 
* **Pro Tips:** Hover over the badge to see the **Field Type** (and if it's Required). Click the badge to **1-click copy** the API name to your clipboard!

### 3. 📋 Quick Copy
Stop struggling to highlight the perfect 18-character ID in the URL bar.

* **How it works:** Whenever you are on a Record page, a small copy icon appears right next to the record's title.
* **What it does:** One click grabs the clean 18-character Record ID straight to your clipboard.

### 4. 🔎 Table Filter
Say goodbye to scrolling through long, unsearchable Setup tables and List Views.

* **How it works:** A smart search bar is automatically injected above standard Salesforce tables (like Profiles, Users, Custom Settings lists).
* **What it does:** Type anything, and the table filters instantly in real-time. No page reloads needed!

---

## 🛠️ Installation & Development

This extension is built with modern tools: **[WXT Framework](https://wxt.dev/)**, **TypeScript**, and **Bun**.

### Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Run the development server (opens a fresh Chrome instance)
npm run dev

# 3. Build for production (creates the .zip file for the Chrome Web Store)
npm run zip
```

---

*Built for speed. Designed for Salesforce Pros.* 💙
