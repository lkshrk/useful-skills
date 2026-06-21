.PHONY: test marketplace-generate marketplace-publish release-check release-create install-smoke skills-sync skills-sync-check

test:
	bun test

marketplace-generate:
	bun scripts/generate_marketplace_specs.ts --version package

marketplace-publish:
	bun scripts/publish_marketplace.ts $(if $(PUSH),--push,)

release-check: marketplace-generate
	bun scripts/verify_release.ts --marketplace-dir dist/marketplace

release-create:
	bun scripts/create_release.ts $(VERSION)

install-smoke:
	bun scripts/install_smoke.ts

skills-sync:
	bun scripts/sync_skill_references.ts

skills-sync-check:
	bun scripts/sync_skill_references.ts --check
