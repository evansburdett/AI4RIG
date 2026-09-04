#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../docs/uml"
java -jar "${PLANTUML_JAR:-$HOME/plantuml.jar}" -tpng -o ../png src/*.puml
echo "Rendered $(ls png/*.png | wc -l) diagrams"
