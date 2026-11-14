# Setup guide (for the owner)

These are the steps only you can do, because they need your accounts. Do them once.

## 1. Hugging Face account
1. Go to **huggingface.co** → **Sign Up**. Verify your email.
2. Hosting a free GPU ("ZeroGPU") Space needs an account that is **more than 30 days old**. Until then you can still create the Space on free CPU hardware — the hello app works there, and Phase 2 (trim, crop, brightness…) needs no GPU at all.

## 2. Create the Space
1. Click your profile picture → **New Space**.
2. Name: `reframe-ai` · SDK: **Gradio** · Hardware: **ZeroGPU** (or **CPU basic** if ZeroGPU isn't offered yet) · **Public**.
3. Click **Create Space**. Your Space ID is `your-username/reframe-ai`.

## 3. Create a token
1. Hugging Face → **Settings → Access Tokens → Create new token**.
2. Type: **Write**. Name it `github-sync`. Copy the token (starts with `hf_`). Keep it secret.

## 4. Tell GitHub about it
In the GitHub repo → **Settings → Secrets and variables → Actions**:
1. Tab **Secrets** → **New repository secret** → Name `HF_TOKEN`, value = the token.
2. Tab **Variables** → **New repository variable** → Name `HF_SPACE_ID`, value = `your-username/reframe-ai`.

## 5. Send the code to the Space
GitHub repo → **Actions** → **Sync to Hugging Face Space** → **Run workflow**.
After a minute or two, open `https://huggingface.co/spaces/your-username/reframe-ai`.

**Phase 0 test:** you should see "Hello! The Space is alive." Click **Check status** (shows app info) and **Check GPU** (on ZeroGPU it names the graphics card).

From now on every change to `space/` on the `main` branch is sent to the Space automatically.

## Later
- **Phase 4:** make the GitHub repo public, then Settings → Pages → Source: **GitHub Actions**.
- **Optional:** add a paid provider key as a Space secret for unlimited use (PLAN.md §4).

## Run it on your own computer (optional)
```bash
pip install -r requirements-dev.txt
cd space
python app.py            # open the link it prints
python -m pytest -q tests
```
