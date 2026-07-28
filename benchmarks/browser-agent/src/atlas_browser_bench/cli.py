# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from .manifest import (
    ImplementationIdentity,
    load_manifest,
    parse_agent_identity,
    parse_environment_identity,
    write_manifest,
)
from .selection import verify_upstream

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_REGISTERED_HARD30 = (
    _PROJECT_ROOT / "manifests" / "webarena-verified-hard-30-v1.json"
)


def _json_object(path: Path) -> dict[str, object]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise TypeError(f"json_object_required:{path}")
    return raw


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="atlas-browser-bench")
    commands = parser.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("validate-manifest")
    validate.add_argument("manifest", type=Path)

    verify = commands.add_parser("verify-upstream")
    verify.add_argument("--manifest", type=Path, default=_REGISTERED_HARD30)
    verify.add_argument("--task-data", type=Path)
    verify.add_argument("--subset-manifest", type=Path)

    freeze = commands.add_parser("freeze-run")
    freeze.add_argument("--registered", type=Path, required=True)
    freeze.add_argument("--baseline-source", required=True)
    freeze.add_argument("--instrumentation", required=True)
    freeze.add_argument("--candidate", required=True)
    freeze.add_argument("--agent-config", type=Path, required=True)
    freeze.add_argument("--environment-config", type=Path, required=True)
    freeze.add_argument("--output", type=Path, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "validate-manifest":
        manifest = load_manifest(args.manifest)
        publishable = True
        try:
            manifest.validate_publishable()
        except ValueError:
            publishable = False
        print(
            json.dumps(
                {
                    "suite": manifest.suite,
                    "state": manifest.publication_state,
                    "tasks": len(manifest.tasks),
                    "publishable": publishable,
                },
                sort_keys=True,
            )
        )
        return 0

    if args.command == "verify-upstream":
        result = verify_upstream(
            load_manifest(args.manifest),
            task_data_source=args.task_data,
            subset_manifest_source=args.subset_manifest,
        )
        print(
            "verified "
            f"suite={result.suite} "
            f"tasks={result.tasks} "
            f"unique_templates={result.unique_templates}"
        )
        return 0

    registered = load_manifest(args.registered)
    if registered.baseline.commit != args.baseline_source:
        raise ValueError("baseline_source_mismatch")
    frozen = registered.freeze_run(
        candidate=ImplementationIdentity(commit=args.candidate),
        agent=parse_agent_identity(_json_object(args.agent_config)),
        environment=parse_environment_identity(_json_object(args.environment_config)),
        instrumentation_commit=args.instrumentation,
    )
    frozen.validate_publishable()
    write_manifest(args.output, frozen)
    print(
        json.dumps(
            {
                "output": str(args.output),
                "suite": frozen.suite,
                "tasks": len(frozen.tasks),
                "publishable": True,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
