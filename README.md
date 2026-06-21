# cockpit-bootc

A [Cockpit](https://cockpit-project.org/) module for managing
[bootc](https://bootc-dev.github.io/bootc/) image-based system updates and
rollbacks.

## Features

- View the booted, staged, and rollback container image status
- Check for and stage updates, then apply with a soft or full reboot
- Roll back to the previous image
- Toggle the `bootc-fetch-apply-updates.timer` for automatic updates

## Requirements

- [Cockpit](https://cockpit-project.org/)
- [bootc](https://github.com/containers/bootc) (`/usr/bin/bootc`)

## Building

```
npm install
./build.js
```

See `DESIGN.md` for architecture rationale and `Makefile` for RPM packaging.

## License

LGPL-2.1-or-later, see `LICENSE`.
