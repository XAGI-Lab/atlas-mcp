# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from collections import Counter
from pathlib import Path

import pytest

from melra_browser_bench.manifest import (
    AgentIdentity,
    EnvironmentIdentity,
    ImplementationIdentity,
    load_manifest,
)

MANIFEST = Path(__file__).resolve().parents[1] / "manifests" / "webarena-verified-hard-30-v1.json"

TASK_IDS = [
    15,
    21,
    67,
    105,
    113,
    166,
    172,
    226,
    268,
    284,
    430,
    446,
    528,
    544,
    556,
    566,
    577,
    603,
    638,
    646,
    658,
    675,
    701,
    708,
    733,
    738,
    780,
    788,
    795,
    799,
]


def complete_run():
    return load_manifest(MANIFEST).freeze_run(
        candidate=ImplementationIdentity(commit="c" * 40),
        agent=AgentIdentity(
            provider="openai-compatible",
            model_id="provider-model-snapshot-2026-07-28",
            model_revision="revision-2026-07-28",
            temperature=0,
            prompt_sha256="a" * 64,
            tool_schema_sha256="b" * 64,
        ),
        environment=EnvironmentIdentity(
            browser="Chrome 150.0.0.0",
            images=("shopping@sha256:" + "d" * 64,),
        ),
        instrumentation_commit="e" * 40,
    )


def test_hard30_manifest_is_registered_and_publishable_when_frozen() -> None:
    manifest = complete_run()
    assert [task.task_id for task in manifest.tasks] == TASK_IDS
    assert len({task.intent_template_id for task in manifest.tasks}) == 30
    assert Counter(task.task_type for task in manifest.tasks) == {
        "MUTATE": 16,
        "NAVIGATE": 5,
        "RETRIEVE": 9,
    }
    assert Counter(task.site_family for task in manifest.tasks) == {
        "gitlab": 7,
        "reddit": 5,
        "shopping": 6,
        "shopping_admin": 6,
        "cross-site": 6,
    }
    manifest.validate_publishable()


def test_registered_manifest_is_not_publishable_before_freeze() -> None:
    with pytest.raises(ValueError, match="manifest_not_frozen"):
        load_manifest(MANIFEST).validate_publishable()


def test_mutable_model_alias_is_not_publishable() -> None:
    registered = load_manifest(MANIFEST)
    mutable = registered.freeze_run(
        candidate=ImplementationIdentity(commit="c" * 40),
        agent=AgentIdentity(
            provider="openai-compatible",
            model_id="latest",
            model_revision="mutable",
            temperature=0,
            prompt_sha256="a" * 64,
            tool_schema_sha256="b" * 64,
        ),
        environment=EnvironmentIdentity(
            browser="Chrome 150.0.0.0",
            images=("shopping@sha256:" + "d" * 64,),
        ),
        instrumentation_commit="e" * 40,
    )
    with pytest.raises(ValueError, match="immutable_model_id_required"):
        mutable.validate_publishable()


def test_mutable_container_tag_is_not_publishable() -> None:
    registered = load_manifest(MANIFEST)
    mutable = registered.freeze_run(
        candidate=ImplementationIdentity(commit="c" * 40),
        agent=AgentIdentity(
            provider="openai-compatible",
            model_id="provider-model-snapshot-2026-07-28",
            model_revision="revision-2026-07-28",
            temperature=0,
            prompt_sha256="a" * 64,
            tool_schema_sha256="b" * 64,
        ),
        environment=EnvironmentIdentity(
            browser="Chrome 150.0.0.0",
            images=("shopping:latest",),
        ),
        instrumentation_commit="e" * 40,
    )
    with pytest.raises(ValueError, match="immutable_environment_required"):
        mutable.validate_publishable()
