# AI4RIG

Advisor-facing bucket planning tool for Railroad Investment Group.
Auburn University Senior Design, Project 22.

## Development setup

Requires Docker Desktop and Node 20+.

    docker compose up -d
    # database on localhost:5432, DB viewer on localhost:8080

## Layout

    apps/web        localhost web app (primary dev target)
    apps/api        backend service
    apps/desktop    Electron shell (packaging, late stage)
    packages/engine pure calculation engine, no I/O
    db/             migrations and seed data
    docs/uml        PlantUML source and rendered diagrams
