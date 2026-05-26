*** Settings ***
Documentation    Regression suite — historical failures from test_summary.txt


*** Test Cases ***
Malformed IPC Payload Does Not Crash Main
    Log    STUB — link to tests/regression/malformed-payloads.test.js    WARN

Health State Corruption Triggers Rollback
    Log    STUB — link to tests/regression/health-edge-cases.test.js    WARN
