# GitHub Release Checklist

1. Revoke/rotate any token that was shared outside Figma.
2. Confirm `.env.local` is ignored.
3. Run `npm test`.
4. Run `npm run pack:dry` and inspect the package contents.
5. Initialize git if needed: `git init`.
6. Stage source files only: `git add .`.
7. Check staged files: `git status --short`.
8. Commit: `git commit -m "Package Figma Pixel Bridge"`.
9. Create an empty GitHub repo and push:

```bash
git remote add origin git@github.com:<user>/<repo>.git
git branch -M main
git push -u origin main
```
