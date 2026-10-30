# Releasing

Releases are automated by [`.github/workflows/release.yml`](.github/workflows/release.yml). Pushing a `v*` tag runs the full verification suite, publishes the packed tarball to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers), and creates a GitHub Release with the tarball attached and generated notes.

No long-lived npm token is stored in GitHub. The workflow authenticates with OIDC and npm generates provenance automatically.

## One-time npm setup

Trusted publishing must be configured once for the package. From a checkout of this repository, sign in to npm as a package maintainer and run:

```bash
npm login
npx npm@11.21.1 trust github @cdsiats/create-stackpress \
  --file release.yml \
  --repo cdsiats/create-stackpress \
  --env npm \
  --allow-publish
```

`--allow-publish` is required because configurations created after September 3, 2026 default to staged publishing only.

Verify the connection:

```bash
npx npm@11.21.1 trust list @cdsiats/create-stackpress
```

Alternatively, use the npmjs.com UI: open the [package settings](https://www.npmjs.com/package/@cdsiats/create-stackpress), find **Trusted Publisher**, choose **GitHub Actions**, and enter organization `cdsiats`, repository `create-stackpress`, workflow filename `release.yml`, environment `npm`, and enable **Allow npm publish**.

Complete the first automated release within 2 days. npm expires a trusted publisher that has not completed a publish within that window.

The workflow filename is case-sensitive and must be exactly `release.yml`. npm also requires the package's `repository.url` to match the GitHub repository; this package already points at `cdsiats/create-stackpress`.

For a manual approval gate before publishing, add required reviewers to the `npm` environment under **Settings → Environments** in GitHub. The release workflow targets that environment.

After the first successful trusted publish, consider setting **Settings → Publishing access** to **Require two-factor authentication and disallow tokens** so only trusted publishing can publish the package.

## Release checklist

1. Choose the version and update every version source:
   - Run `npm version 0.1.1 --no-git-tag-version` to update `package.json` and `package-lock.json`.
   - Set `CLI_VERSION` in `src/version.ts` to the same version.
   - Bump `TEMPLATE_VERSION` in `src/version.ts` when the bundled templates change.
2. Run the local checks:

   ```bash
   npm ci
   npm run release:check
   npm test
   ```

3. Commit the version bump, open a pull request, and merge it to the default branch after CI passes.
4. Tag the merge commit and push the tag:

   ```bash
   git switch main
   git pull --ff-only
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. Watch the **Release** workflow. It will:
   - reject the tag unless it matches `package.json` and points to a commit on the default branch;
   - run `npm ci`, `release:check`, `typecheck`, the full test suite, a build, and the heavy packaged-CLI smoke;
   - pack one tarball, publish that exact tarball to npm, and attach it to a GitHub Release.

Stable versions publish with the `latest` dist-tag. Versions containing a prerelease suffix, such as `v0.2.0-beta.1`, publish with `next`.

## Reruns and recovery

- **Verification failed before publishing:** fix the problem, then delete and recreate the tag only if the version has not been published:

  ```bash
  git tag -d v0.2.0
  git push origin :refs/tags/v0.2.0
  ```

- **npm publish succeeded but the GitHub Release step failed:** re-run the failed jobs from the Actions tab. The publish script compares the local tarball integrity with the registry and skips publishing when the same version and bytes already exist.
- **The registry has the version with different contents:** the workflow fails on purpose. Bump the version; a published version can never be reused.
- **`ENEEDAUTH` or "Unable to authenticate":** confirm the trusted publisher fields are exact, especially the `release.yml` filename and repository, and that the job has `id-token: write`. Self-hosted runners are not supported by npm trusted publishing.

## Local checks

```bash
npm run release:check
npm run release:check -- --tag v0.2.0
npm pack --dry-run --json
```

`release:check` verifies that `package.json`, `package-lock.json`, and `src/version.ts` agree, that the versions are valid semver, and that an optional tag matches the package version. It does not contact npm or publish anything.
