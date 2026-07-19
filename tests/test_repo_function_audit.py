import importlib.util
import unittest
from pathlib import Path


def load_module():
    spec = importlib.util.spec_from_file_location(
        "repo_function_audit",
        Path(__file__).resolve().parents[1] / "output" / "repo_function_audit.py",
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class RepoFunctionAuditTests(unittest.TestCase):
    def test_find_references_counts_same_file_usage_without_definition_line(self):
        module = load_module()
        files = {
            "/tmp/demo.py": "def helper():\n    return 1\n\ndef caller():\n    return helper()\n",
        }

        result = module.find_references(files, "helper", "/tmp/demo.py", [1])

        self.assertEqual(result["same_file_call_count"], 1)
        self.assertEqual(result["same_file_string_count"], 0)
        self.assertEqual(result["reference_count"], 0)
        self.assertEqual(result["string_reference_count"], 0)


if __name__ == "__main__":
    unittest.main()
