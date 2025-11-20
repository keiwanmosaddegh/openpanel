# 🚀 OpenPanel Custom Deployment Cheat Sheet

### 1. Making Code Changes (The Routine)
*Use this when you modify the frontend, backend logic, or worker.*

**A. On Your Local Computer:**
1.  **Make your changes** in your code editor.
2.  **Build & Push** the specific service you changed (or all of them).
    *   *Note: The script automatically handles ARM vs Intel architecture.*
    ```bash
    # Choose the service you modified: api, worker, or start
    ./sh/docker-build api latest
    ./sh/docker-build worker latest
    ./sh/docker-build start latest
    ```
3.  **Commit your code** (Good practice, keeps your history safe).
    ```bash
    git add .
    git commit -m "fix: description of changes"
    git push origin HEAD
    ```

**B. On Your VPS:**
1.  SSH into the server.
2.  Navigate to the folder:
    ```bash
    cd ~/openpanel/self-hosting
    ```
3.  **Pull the new images** from Docker Hub:
    ```bash
    # Pulls the latest version of the images you just pushed
    docker compose pull
    ```
4.  **Restart the services** to apply the changes:
    ```bash
    ./start
    ```

---

### 2. Changing Configuration (Env Vars, Ports, etc.)
*Use this if you edit `docker-compose.template.yml` or `.env`.*

**A. On Your Local Computer:**
1.  Edit `self-hosting/docker-compose.template.yml`.
2.  Commit and push the changes to GitHub.

**B. On Your VPS:**
1.  SSH in and navigate:
    ```bash
    cd ~/openpanel/self-hosting
    ```
2.  **Download your config changes** from GitHub:
    ```bash
    git pull
    ```
3.  **Regenerate the config** (Crucial step):
    ```bash
    ./setup
    # (Press Enter through the prompts to keep existing settings)
    ```
4.  **Restart:**
    ```bash
    ./start
    ```

---

### 3. Syncing with Official OpenPanel Updates
*Use this when OpenPanel releases cool new features you want.*

**A. On Your Local Computer:**
1.  **Fetch the latest upstream code:**
    ```bash
    git checkout main
    git pull origin main
    git fetch upstream main  # Assuming 'upstream' is the official repo
    ```
2.  **Merge into your custom branch:**
    ```bash
    git checkout my-custom-version
    git merge upstream/main
    ```
3.  **Resolve Conflicts:**
    *   *Watch out for:* Changes to `apps/api/Dockerfile` (ensure they didn't overwrite your logic) or `packages/db` (ensure no `ON CLUSTER` returned).
    *   *Tip:* Run `grep -r "ON CLUSTER" packages/db` just to be safe.
4.  **Rebuild Everything:**
    ```bash
    ./sh/docker-build api latest
    ./sh/docker-build worker latest
    ./sh/docker-build start latest
    ```
5.  **Deploy** (See Section 1B).

---

### ⚠️ Production Safety Rules

Since you have real clients starting tomorrow, **NEVER** run this command on the VPS:
❌ `./danger_wipe_everything`

**Why?** It deletes the database volumes. Your client data will vanish.
*   **If you must restart cleanly:** Use `./stop` followed by `./start`.
*   **If you must debug:** Use `./logs`.

### 🚑 Emergency Troubleshooting
If the site goes down after a deploy:

1.  **Check the logs:**
    ```bash
    cd ~/openpanel/self-hosting
    ./logs
    ```
2.  **Check if the migration failed:**
    Look at the `op-api` logs. If you see "Cluster" errors, you might have accidentally pulled a bad file.
3.  **Rollback (The "Undo" Button):**
    If your new code is broken, you can revert your local code, rebuild the images, and deploy again.
