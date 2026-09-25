import sys
import unittest

sys.stdout.reconfigure(encoding='utf-8')

loader = unittest.TestLoader()
suite = loader.discover('tests', pattern='test_*.py')
result = unittest.TestResult()
suite.run(result)

print(f"Total failures: {len(result.failures)}")
for i, (test, trace) in enumerate(result.failures):
    print(f"\n--- Failure {i+1}: {test.id()} ---")
    print(trace.strip().split('\n')[-1])
