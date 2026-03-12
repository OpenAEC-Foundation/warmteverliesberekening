"""CLI entry point for ifc-tool.

Protocol:
    ifc-tool import --input model.ifc [--verbose]
    → stdout: IfcImportResult JSON
    → stderr: diagnostics/logging
    → exit 0 = success, exit 1 = error (error JSON on stdout)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from ifc_tool.models import ImportError as ImportErrorModel


def main(argv: list[str] | None = None) -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="ifc-tool",
        description="IFC import/export tool for ISSO 51",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Import subcommand
    import_parser = subparsers.add_parser(
        "import",
        help="Import an IFC file → JSON",
    )
    import_parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Path to the .ifc file",
    )
    import_parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose logging on stderr",
    )
    import_parser.add_argument(
        "--no-close-gaps",
        action="store_true",
        help="Skip gap closing (keep original IfcSpace geometry)",
    )

    args = parser.parse_args(argv)

    if args.command == "import":
        _run_import(args)


def _run_import(args: argparse.Namespace) -> None:
    """Execute the import command."""
    # Configure logging to stderr
    level = logging.DEBUG if args.verbose else logging.WARNING
    logging.basicConfig(
        level=level,
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )

    try:
        from ifc_tool.import_ifc.importer import import_ifc

        result = import_ifc(
            args.input,
            close_gaps=not args.no_close_gaps,
        )

        # Output JSON to stdout
        output = result.model_dump(by_alias=True)
        json.dump(output, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        sys.exit(0)

    except FileNotFoundError as exc:
        _error_exit(str(exc), "file_not_found")
    except ValueError as exc:
        _error_exit(str(exc), "parse_error")
    except Exception as exc:
        _error_exit(f"Unexpected error: {exc}", "internal_error")


def _error_exit(message: str, detail: str | None = None) -> None:
    """Write error JSON to stdout and exit with code 1."""
    error = ImportErrorModel(error=message, detail=detail)
    json.dump(error.model_dump(), sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.exit(1)
