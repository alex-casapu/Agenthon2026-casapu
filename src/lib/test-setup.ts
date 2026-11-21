import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests run against the default principals, never against a world's data/principals.json.
process.env.BRAIN_PRINCIPALS = join(tmpdir(), "brain-tests-no-principals.json");

// Most tests exercise curation, so they start in approve-first mode. Tests of trust-by-default turn it on
// explicitly (and one test checks that it really is the default when nothing is set).
process.env.BRAIN_TRUST = "off";
