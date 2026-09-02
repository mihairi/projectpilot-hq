# Project Harmony Hub

Build a new enterpise application clone of Jira and Confluence for project, task management, knowledge base management to be used by business requesters, business analysts, developers, project members, test users, project managers with specific acceess rights defined for every role. A local database should be used, not cloud. Login with username / password, code generated 2FA added on Microsoft Authenbticator App or Google Autneticator APP.  The users with Admin rights should be able to create new users / assign or change roles / remove access form users that left the company, send them 2FA QR codes and reset passwords. A global project manager should be able to set and update global project priorities (5 levels) with notification to project members when priority is changed. The application should allow project managers, and business managers to report on project and task status, resource allocation, initial estimated start, initial estimated duration, initial estimated end time, updated start date, updated duration, updated end time, real start date, real duration, real end time. Users should be able able to select if there are any dependencies on former tasks from current project or different projects.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://projectpilot-hq.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f922aeaf-8add-4c80-b3ea-9012438cd85c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
