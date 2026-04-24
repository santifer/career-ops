# Config Context

`config/` contains profile configuration templates and, in this private workspace, the user's real profile.

`profile.yml` is user layer. It can include identity, target roles, compensation preferences, geography, language preferences, deal breakers, and narrative notes. Update it when the user asks to personalize the system.

`profile.example.yml` is system layer. Keep it generic and safe for reuse. Do not copy real user data into the example.

If a setting affects only this user's search, prefer `config/profile.yml` or `modes/_profile.md`. If it changes reusable behavior for everyone, update the relevant system-layer mode or script instead.
