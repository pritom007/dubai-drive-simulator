# Security policy

## Supported version

Security fixes are applied to the latest version on the default branch.

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** private reporting flow. Do not open a public issue for an unpatched vulnerability or include active credentials, private Makani numbers, or personal address data in a report.

Include the affected version, reproduction steps, impact, and any suggested mitigation. Maintainers should acknowledge a report within seven days and coordinate disclosure after a fix is available.

The application sends explicit address searches to Nominatim, Makani numbers to Dubai Municipality, and on-demand corridor endpoints to routing/map services. Deployers should review those providers' current policies and privacy terms before hosting the project publicly.
