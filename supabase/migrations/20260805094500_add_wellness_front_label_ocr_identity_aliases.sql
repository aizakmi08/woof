-- Deterministic retailer identity aliases, wave wellness-front-label-ocr.
-- Generated from inputs/catalog-reviewed-wellness-front-label-ocr-aliases-20260805.json after exact official/live evidence validation.
-- Retailer rows remain identity-only; this migration never copies retailer
-- ingredients or images into product_data and never changes scoring.

DO $migration$
DECLARE
  v_payload JSONB := convert_from(
    decode('W3siYWxpYXNfZm9ybXVsYV9rZXkiOiJ3ZWxsbmVzcyBwZXQgY29tcGFueXx3ZWxsbmVzc3x3ZWxsbmVzcyBjb3JlIHNpZ25hdHVyZSBzZWxlY3RzIGNodW5reSBjaGlja2VuIGFuZCB0dXJrZXkgZW50cmVlIG5hdHVyYWwgZ3JhaW4gZnJlZSB3ZXQgY2F0IGZvb2R8Y2F0fHVua25vd258d2V0fHwiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuY2hld3kuY29tL3dlbGxuZXNzLWNvcmUtc2lnbmF0dXJlLXNlbGVjdHMvZHAvMTQ3MTE0Iiwib2ZmaWNpYWxfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LndlbGxuZXNzcGV0Zm9vZC5jb20vcHJvZHVjdC1jYXRhbG9nL3dlbGxuZXNzLWNvcmUtc2lnbmF0dXJlLXNlbGVjdHMtY2h1bmt5LWNoaWNrZW4tdHVya2V5LyIsImNhY2hlX2tleSI6IndlbGxuZXNzLXBldC1jb21wYW55OndlbGxuZXNzIHdlbGxuZXNzIGNvcmUgc2lnbmF0dXJlIHNlbGVjdHMgY2h1bmt5IGJvbmVsZXNzIGNoaWNrZW4gdHVya2V5IGVudHIgZSBpbiBzYXVjZSBwcm9kdWN0LWNhdGFsb2cgd2VsbG5lc3MtY29yZS1zaWduYXR1cmUtc2VsZWN0cy1jaHVua3ktY2hpY2tlbi10dXJrZXkiLCJyZXZpZXdfbWV0aG9kIjoiZXhhY3RfZXhpc3RpbmdfZm9ybXVsYV9pZGVudGl0eV9vbmx5IiwicmV2aWV3ZWRfYXQiOiIyMDI2LTA4LTA1VDEwOjA1OjAwLjAwMFoiLCJyZXZpZXdfcmVhc29uIjoiRnJvemVuIENoZXd5IGFuZCBjdXJyZW50IFdlbGxuZXNzIHBhY2thZ2UgZnJvbnRzIHNob3cgdGhlIHNhbWUgU2lnbmF0dXJlIFNlbGVjdHMgdGV4dHVyZSBhbmQgZXhhY3QgcmVjaXBlLiBSZXRhaWxlciBldmlkZW5jZSBpcyBpZGVudGl0eS1vbmx5OyBjdXJyZW50IGluZ3JlZGllbnRzIGFuZCBzZXJ2aW5nIGltYWdlIHJlbWFpbiBtYW51ZmFjdHVyZXItc291cmNlZC4iLCJyZXZpZXdlZF9vcmlnaW5hbF9ldmlkZW5jZV90aWVyIjoidW52ZXJpZmllZCIsInJldGFpbGVyX2lkZW50aXR5X29ubHkiOnRydWUsInJldGFpbGVyX2luZ3JlZGllbnRfdmVyaWZpY2F0aW9uIjpmYWxzZSwicmV0YWlsZXJfc291cmNlX3NsdWciOiJjaGV3eS1wdWJsaWMtc2l0ZW1hcCIsInJldGFpbGVyX3Byb2R1Y3RfaWQiOiIxNDcxMTQiLCJyZXRhaWxlcl90aXRsZSI6IldlbGxuZXNzIENPUkUgU2lnbmF0dXJlIFNlbGVjdHMgQ2h1bmt5IENoaWNrZW4gJiBUdXJrZXkgRW50cmVlIE5hdHVyYWwgR3JhaW4tRnJlZSBXZXQgQ2F0IEZvb2QiLCJyZXRhaWxlcl9jb250ZW50X2hhc2giOiJlYWExNzUzMTYyNTk3YmMxNjlhNWFiN2U0OTFjNWZiY2JmNDM1ZDgwNmM5MmIwM2ZmZjc5NjI3OWFhNzA4NjgyIiwicmV0YWlsZXJfb2JzZXJ2ZWRfYXQiOiIyMDI2LTA4LTA1VDAyOjI1OjEyLjE2NloiLCJyZXRhaWxlcl9mcm9udF9pbWFnZV91cmwiOiJodHRwczovL2ltYWdlLmNoZXd5LmNvbS9jYXRhbG9nL2dlbmVyYWwvaW1hZ2VzL21vZS8wNjhjODZjZi0wOTk5LTc2NmUtODAwMC1hZGFlZjI5ODQ1YWUuX1YxXy5qcGciLCJyZXRhaWxlcl9mcm9udF9pbWFnZV9zaGEyNTYiOiI0NWNkMTZiYWJjODQ1NjUwOTMwM2Q0Yjg4MjgzNmE0MTZkYjRmMzVlMDhlZDUzMmI2ZmZkN2IwMWRmMjkxOTk3IiwibWFudWFsX2Zyb250X2xhYmVsX29jcl9tYXRjaCI6dHJ1ZSwibWFudWFsX2Zyb250X2xhYmVsX3Zpc3VhbF9tYXRjaCI6dHJ1ZSwicmV0YWlsZXJfZnJvbnRfbGFiZWxfb2NyIjoiQ1JBSU4gV0VMTE5FU1MuIEhFQUxUaFkgRk9SIEFEVUxUIENBIFNFTEVDVFMgQ0hVTktZIGwgQm9uZWxlc3MgQ2hpY2tlbiAmIFR1cmtleSBFbnRyZcOpIGluIFNhdWNlIE5FVCBXVDUsMzBaMTE1MGcpIiwib2ZmaWNpYWxfZnJvbnRfbGFiZWxfb2NyIjoiRlJFRSBTRUxFQ1RTIFVOS1kgb25lbGVzcyBDaGlja2VuICYgVHVya2V5IEVudHJlw6kgaW4gY2UiLCJyZXF1aXJlZF9vY3JfdGVybXMiOlsic2VsZWN0cyIsImNoaWNrZW4iLCJ0dXJrZXkiLCJlbnRyZWUiXSwicmVxdWlyZWRfdGl0bGVfdGVybXMiOlsid2VsbG5lc3MiLCJzaWduYXR1cmUgc2VsZWN0cyIsImNodW5reSIsImNoaWNrZW4iLCJ0dXJrZXkiLCJ3ZXQgY2F0IGZvb2QiXSwicHJvdGVjdGVkX2lkZW50aXR5X3Rlcm1zIjpbInNpZ25hdHVyZSBzZWxlY3RzIiwiY2h1bmt5IiwiY2hpY2tlbiIsInR1cmtleSJdLCJvYnNlcnZlZF9pZGVudGl0eSI6eyJicmFuZCI6IldlbGxuZXNzIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoidW5rbm93biIsImZvb2RfZm9ybSI6IndldCJ9LCJ0YXJnZXRfZm9ybXVsYV9rZXkiOiJ3ZWxsbmVzcyBwZXQgY29tcGFueXx3ZWxsbmVzc3x3ZWxsbmVzcyBjb3JlIHNpZ25hdHVyZSBzZWxlY3RzIGNodW5reSBib25lbGVzcyBjaGlja2VuIGFuZCB0dXJrZXkgZW50cmVlIGluIHNhdWNlfGNhdHx1bmtub3dufHdldHxjaGlja2VuIGFuZCB0dXJrZXkgZW50cmVlfCIsInRhcmdldF9zZXJ2aW5nX2Zvcm11bGFfa2V5Ijoid2VsbG5lc3MgcGV0IGNvbXBhbnl8d2VsbG5lc3N8d2VsbG5lc3MgY29yZSBzaWduYXR1cmUgc2VsZWN0cyBjaHVua3kgYm9uZWxlc3MgY2hpY2tlbiBhbmQgdHVya2V5IGVudHJlZSBpbiBzYXVjZXxjYXR8dW5rbm93bnx3ZXR8Y2hpY2tlbiBhbmQgdHVya2V5IGVudHJlZXwiLCJ0YXJnZXRfaWRlbnRpdHkiOnsiYnJhbmQiOiJXZWxsbmVzcyIsInByb2R1Y3RfbmFtZSI6IldlbGxuZXNzIENPUkUgU0lHTkFUVVJFIFNFTEVDVFMgQ2h1bmt5IEJvbmVsZXNzIENoaWNrZW4gJiBUdXJrZXkgRW50csOpZSBpbiBTYXVjZSIsInByb2R1Y3RfbGluZSI6IldlbGxuZXNzIENPUkUgU0lHTkFUVVJFIFNFTEVDVFMgQ2h1bmt5IEJvbmVsZXNzIENoaWNrZW4gJiBUdXJrZXkgRW50csOpZSBpbiBTYXVjZSIsImZsYXZvciI6IkNoaWNrZW4gJiBUdXJrZXkgRW50csOpZSIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6InVua25vd24iLCJmb29kX2Zvcm0iOiJ3ZXQifSwib2ZmaWNpYWxfaW1hZ2VfdXJsIjoiaHR0cHM6Ly9pbWFnZXMuc2Fsc2lmeS5jb20vaW1hZ2UvdXBsb2FkL3MtLTlpWm0tRzRyLS0vd181MDAvODNiNWU2ZjgzYThkMTk5Y2Y0OTRiMTA4MGMyYTI3YWYxN2Q4MzUxNi5qcGciLCJvZmZpY2lhbF9kYXRhYmFzZV9pbWFnZV91cmwiOiJodHRwczovL2ltYWdlcy5zYWxzaWZ5LmNvbS9pbWFnZS91cGxvYWQvcy0tOWlabS1HNHItLS93XzUwMC84M2I1ZTZmODNhOGQxOTljZjQ5NGIxMDgwYzJhMjdhZjE3ZDgzNTE2LmpwZyIsIm9mZmljaWFsX2FydGlmYWN0X2ltYWdlX3NoYTI1NiI6IjM1YzQ0MDZmZTkwODE4ZmUwZDU4NmEyNGJmMTU1N2QxOTEyN2Y0ZDg3NTlkYjQ4MzU5ZDJmNjhiZjMwYjM1YWYiLCJvZmZpY2lhbF9pbmdyZWRpZW50X2NvdW50IjozMywib2ZmaWNpYWxfZGF0YWJhc2VfaW5ncmVkaWVudF9oYXNoIjoiZmIyYjc1MTU5Nzk3OWM1NTRlM2Q2M2RiZWYwNDQ2Nzk1MWUyYzI3ODQ2NDc4Yjg1ZjhkOWUyY2UyZTMxYjJlMiIsIm9mZmljaWFsX2Nhbm9uaWNhbF9pbmdyZWRpZW50X2hhc2giOiJiNjUxMjkwYmUyOTA5MmI1MDY4ZDFmMDYyMzJhNWMyY2Q0Y2ZkOTJmNzcxODEwNzQzZTZkNzRjMGEyMzY3ZGQzIn0seyJhbGlhc19mb3JtdWxhX2tleSI6IndlbGxuZXNzIHBldCBjb21wYW55fHdlbGxuZXNzfHdlbGxuZXNzIGNvcmUgc2lnbmF0dXJlIHNlbGVjdHMgY2h1bmt5IGJlZWYgYW5kIGNoaWNrZW4gZW50cmVlIG5hdHVyYWwgZ3JhaW4gZnJlZSB3ZXQgY2F0IGZvb2R8Y2F0fHVua25vd258d2V0fHwiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuY2hld3kuY29tL3dlbGxuZXNzLWNvcmUtc2lnbmF0dXJlLXNlbGVjdHMvZHAvMTQ3MTQ0Iiwib2ZmaWNpYWxfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LndlbGxuZXNzcGV0Zm9vZC5jb20vcHJvZHVjdC1jYXRhbG9nL3dlbGxuZXNzLWNvcmUtc2lnbmF0dXJlLXNlbGVjdHMtY2h1bmt5LWJlZWYtY2hpY2tlbi8iLCJjYWNoZV9rZXkiOiJ3ZWxsbmVzcy1wZXQtY29tcGFueTp3ZWxsbmVzcyB3ZWxsbmVzcyBjb3JlIHNpZ25hdHVyZSBzZWxlY3RzIGNodW5reSBiZWVmIGJvbmVsZXNzIGNoaWNrZW4gZW50ciBlIGluIHNhdWNlIHByb2R1Y3QtY2F0YWxvZyB3ZWxsbmVzcy1jb3JlLXNpZ25hdHVyZS1zZWxlY3RzLWNodW5reS1iZWVmLWNoaWNrZW4iLCJyZXZpZXdfbWV0aG9kIjoiZXhhY3RfZXhpc3RpbmdfZm9ybXVsYV9pZGVudGl0eV9vbmx5IiwicmV2aWV3ZWRfYXQiOiIyMDI2LTA4LTA1VDEwOjA1OjAwLjAwMFoiLCJyZXZpZXdfcmVhc29uIjoiRnJvemVuIENoZXd5IGFuZCBjdXJyZW50IFdlbGxuZXNzIHBhY2thZ2UgZnJvbnRzIHNob3cgdGhlIHNhbWUgU2lnbmF0dXJlIFNlbGVjdHMgdGV4dHVyZSBhbmQgZXhhY3QgcmVjaXBlLiBSZXRhaWxlciBldmlkZW5jZSBpcyBpZGVudGl0eS1vbmx5OyBjdXJyZW50IGluZ3JlZGllbnRzIGFuZCBzZXJ2aW5nIGltYWdlIHJlbWFpbiBtYW51ZmFjdHVyZXItc291cmNlZC4iLCJyZXZpZXdlZF9vcmlnaW5hbF9ldmlkZW5jZV90aWVyIjoidW52ZXJpZmllZCIsInJldGFpbGVyX2lkZW50aXR5X29ubHkiOnRydWUsInJldGFpbGVyX2luZ3JlZGllbnRfdmVyaWZpY2F0aW9uIjpmYWxzZSwicmV0YWlsZXJfc291cmNlX3NsdWciOiJjaGV3eS1wdWJsaWMtc2l0ZW1hcCIsInJldGFpbGVyX3Byb2R1Y3RfaWQiOiIxNDcxNDQiLCJyZXRhaWxlcl90aXRsZSI6IldlbGxuZXNzIENPUkUgU2lnbmF0dXJlIFNlbGVjdHMgQ2h1bmt5IEJlZWYgJiBDaGlja2VuIEVudHJlZSBOYXR1cmFsIEdyYWluLUZyZWUgV2V0IENhdCBGb29kIiwicmV0YWlsZXJfY29udGVudF9oYXNoIjoiZDZhNTcxYTllOWEwN2JkZjhkZjk4OTJhYTVhN2RmMWQwYjYxZDZhOTY0OTFjMDE1NTQzZmViYzE4MzdiMGYzNSIsInJldGFpbGVyX29ic2VydmVkX2F0IjoiMjAyNi0wOC0wNVQwMjoyNToyMi4wNTdaIiwicmV0YWlsZXJfZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly9pbWFnZS5jaGV3eS5jb20vY2F0YWxvZy9nZW5lcmFsL2ltYWdlcy9tb2UvMDY4Yzg2Y2UtYjdjZC03OTZjLTgwMDAtODM1MTk5Yzc5ZmFkLl9WMV8uanBnIiwicmV0YWlsZXJfZnJvbnRfaW1hZ2Vfc2hhMjU2IjoiNzk4N2RmZTk2YTg5ODEwY2MxY2MzNTA0NmI0YmE2ZDY2OTYzMWUyYTQ2OGI4ZTUyM2RjODk5NmRlOWI0NjBiNyIsIm1hbnVhbF9mcm9udF9sYWJlbF9vY3JfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF92aXN1YWxfbWF0Y2giOnRydWUsInJldGFpbGVyX2Zyb250X2xhYmVsX29jciI6IkNSQUlOIFdFTExORVNTLiBIRUFMVEhZIEZPUiBBRFVMVCBDQSBTRUxFQ1RTIENIVU5LWSBsIEJlZWYgJiBCb25lbGVzcyBDaGlja2VuIEVudHJlw6kgaW4gU2F1Y2UgTkVUIFdJIDUsMyBPWiAoMTUwZykiLCJvZmZpY2lhbF9mcm9udF9sYWJlbF9vY3IiOiJTRUxFQ1RTLSBDSFVOS1kgaSBCZWVmICYgQm9uZWxlc3MgQ2hpY2tlbiBFbnRyZcOpIGluIFNhdWNlIHlpbGwiLCJyZXF1aXJlZF9vY3JfdGVybXMiOlsic2VsZWN0cyIsImNodW5reSIsImJlZWYiLCJib25lbGVzcyBjaGlja2VuIiwic2F1Y2UiXSwicmVxdWlyZWRfdGl0bGVfdGVybXMiOlsid2VsbG5lc3MiLCJzaWduYXR1cmUgc2VsZWN0cyIsImNodW5reSIsImJlZWYiLCJjaGlja2VuIiwid2V0IGNhdCBmb29kIl0sInByb3RlY3RlZF9pZGVudGl0eV90ZXJtcyI6WyJzaWduYXR1cmUgc2VsZWN0cyIsImNodW5reSIsImJlZWYiLCJjaGlja2VuIl0sIm9ic2VydmVkX2lkZW50aXR5Ijp7ImJyYW5kIjoiV2VsbG5lc3MiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJ1bmtub3duIiwiZm9vZF9mb3JtIjoid2V0In0sInRhcmdldF9mb3JtdWxhX2tleSI6IndlbGxuZXNzIHBldCBjb21wYW55fHdlbGxuZXNzfHdlbGxuZXNzIGNvcmUgc2lnbmF0dXJlIHNlbGVjdHMgY2h1bmt5IGJlZWYgYW5kIGJvbmVsZXNzIGNoaWNrZW4gZW50cmVlIGluIHNhdWNlfGNhdHx1bmtub3dufHdldHxiZWVmIGFuZCBib25lbGVzcyBjaGlja2VuIGVudHJlZXwiLCJ0YXJnZXRfc2VydmluZ19mb3JtdWxhX2tleSI6IndlbGxuZXNzIHBldCBjb21wYW55fHdlbGxuZXNzfHdlbGxuZXNzIGNvcmUgc2lnbmF0dXJlIHNlbGVjdHMgY2h1bmt5IGJlZWYgYW5kIGJvbmVsZXNzIGNoaWNrZW4gZW50cmVlIGluIHNhdWNlfGNhdHx1bmtub3dufHdldHxiZWVmIGFuZCBib25lbGVzcyBjaGlja2VuIGVudHJlZXwiLCJ0YXJnZXRfaWRlbnRpdHkiOnsiYnJhbmQiOiJXZWxsbmVzcyIsInByb2R1Y3RfbmFtZSI6IldlbGxuZXNzIENPUkUgU0lHTkFUVVJFIFNFTEVDVFMgQ2h1bmt5IEJlZWYgJiBCb25lbGVzcyBDaGlja2VuIEVudHLDqWUgaW4gU2F1Y2UiLCJwcm9kdWN0X2xpbmUiOiJXZWxsbmVzcyBDT1JFIFNJR05BVFVSRSBTRUxFQ1RTIENodW5reSBCZWVmICYgQm9uZWxlc3MgQ2hpY2tlbiBFbnRyw6llIGluIFNhdWNlIiwiZmxhdm9yIjoiQmVlZiAmIEJvbmVsZXNzIENoaWNrZW4gRW50csOpZSIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6InVua25vd24iLCJmb29kX2Zvcm0iOiJ3ZXQifSwib2ZmaWNpYWxfaW1hZ2VfdXJsIjoiaHR0cHM6Ly9pbWFnZXMuc2Fsc2lmeS5jb20vaW1hZ2UvdXBsb2FkL3MtLUd1QmpKSWt0LS0vd181MDAvN2FlOTg1YmM4MzRmZjkzNGE4MjdlNDljZjViN2QzNDg0M2NmYjg3Yy5qcGciLCJvZmZpY2lhbF9kYXRhYmFzZV9pbWFnZV91cmwiOiJodHRwczovL2ltYWdlcy5zYWxzaWZ5LmNvbS9pbWFnZS91cGxvYWQvcy0tR3VCakpJa3QtLS93XzUwMC83YWU5ODViYzgzNGZmOTM0YTgyN2U0OWNmNWI3ZDM0ODQzY2ZiODdjLmpwZyIsIm9mZmljaWFsX2FydGlmYWN0X2ltYWdlX3NoYTI1NiI6ImYwZjdlMmY5ZDdjMWViMWNkZjIyMGQ2Mjk0MzFiZGQwNGY5ZDkwOGQ1ODVmNGE0NmI3MDBiNGU2YzRhMjE4MmIiLCJvZmZpY2lhbF9pbmdyZWRpZW50X2NvdW50IjozNCwib2ZmaWNpYWxfZGF0YWJhc2VfaW5ncmVkaWVudF9oYXNoIjoiZTYxMzM1N2RmMGNhOWY0NTRiNDQ1MDQ2NTFmNGQ0N2Y4NTRjZDFlMDM3MDkxNzg1NTgxMzE1Yjc3MmEzNzYzZSIsIm9mZmljaWFsX2Nhbm9uaWNhbF9pbmdyZWRpZW50X2hhc2giOiI5OTdkZmM5MzZlNjM2MThkMjcyOTlkNjQxMjE2ZDMxOTA5NWUxZDViODI0NTM5ZjE3MTYzNDk1YWNkYjMyNGJkIn0seyJhbGlhc19mb3JtdWxhX2tleSI6IndlbGxuZXNzIHBldCBjb21wYW55fHdlbGxuZXNzfHdlbGxuZXNzIGNvcmUgc2lnbmF0dXJlIHNlbGVjdHMgc2hyZWRkZWQgY2hpY2tlbiBhbmQgdHVya2V5IGVudHJlZSBuYXR1cmFsIGdyYWluIGZyZWUgd2V0IGNhdCBmb29kfGNhdHx1bmtub3dufHdldHx8Iiwic291cmNlX3VybCI6Imh0dHBzOi8vd3d3LmNoZXd5LmNvbS93ZWxsbmVzcy1jb3JlLXNpZ25hdHVyZS1zZWxlY3RzL2RwLzE3ODM4MjIiLCJvZmZpY2lhbF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cud2VsbG5lc3NwZXRmb29kLmNvbS9wcm9kdWN0LWNhdGFsb2cvd2VsbG5lc3MtY29yZS1zaWduYXR1cmUtc2VsZWN0cy1zaHJlZGRlZC1jaGlja2VuLXR1cmtleS1pbi1zYXVjZS8iLCJjYWNoZV9rZXkiOiJ3ZWxsbmVzcy1wZXQtY29tcGFueTp3ZWxsbmVzcyB3ZWxsbmVzcyBjb3JlIHNpZ25hdHVyZSBzZWxlY3RzIHNocmVkZGVkIGJvbmVsZXNzIGNoaWNrZW4gdHVya2V5IGVudHIgZSBpbiBzYXVjZSBwcm9kdWN0LWNhdGFsb2cgd2VsbG5lc3MtY29yZS1zaWduYXR1cmUtc2VsZWN0cy1zaHJlZGRlZC1jaGlja2VuLXR1cmtleS1pbi1zYXVjZSIsInJldmlld19tZXRob2QiOiJleGFjdF9leGlzdGluZ19mb3JtdWxhX2lkZW50aXR5X29ubHkiLCJyZXZpZXdlZF9hdCI6IjIwMjYtMDgtMDVUMTA6MDU6MDAuMDAwWiIsInJldmlld19yZWFzb24iOiJGcm96ZW4gQ2hld3kgYW5kIGN1cnJlbnQgV2VsbG5lc3MgcGFja2FnZSBmcm9udHMgc2hvdyB0aGUgc2FtZSBTaWduYXR1cmUgU2VsZWN0cyB0ZXh0dXJlIGFuZCBleGFjdCByZWNpcGUuIFJldGFpbGVyIGV2aWRlbmNlIGlzIGlkZW50aXR5LW9ubHk7IGN1cnJlbnQgaW5ncmVkaWVudHMgYW5kIHNlcnZpbmcgaW1hZ2UgcmVtYWluIG1hbnVmYWN0dXJlci1zb3VyY2VkLiIsInJldmlld2VkX29yaWdpbmFsX2V2aWRlbmNlX3RpZXIiOiJ1bnZlcmlmaWVkIiwicmV0YWlsZXJfaWRlbnRpdHlfb25seSI6dHJ1ZSwicmV0YWlsZXJfaW5ncmVkaWVudF92ZXJpZmljYXRpb24iOmZhbHNlLCJyZXRhaWxlcl9zb3VyY2Vfc2x1ZyI6ImNoZXd5LXB1YmxpYy1zaXRlbWFwIiwicmV0YWlsZXJfcHJvZHVjdF9pZCI6IjE3ODM4MjIiLCJyZXRhaWxlcl90aXRsZSI6IldlbGxuZXNzIENPUkUgU2lnbmF0dXJlIFNlbGVjdHMgU2hyZWRkZWQgQ2hpY2tlbiAmIFR1cmtleSBFbnRyZWUgTmF0dXJhbCBHcmFpbi1GcmVlIFdldCBDYXQgRm9vZCIsInJldGFpbGVyX2NvbnRlbnRfaGFzaCI6IjE1ZDJhODIwYTAyOGM5NDFhYTI0NzVjYWE1NTE5MzE5NDNiYmNkYjBhNWIxODEyMjdlNWIyZjNhNWU3ZTE0ZTIiLCJyZXRhaWxlcl9vYnNlcnZlZF9hdCI6IjIwMjYtMDgtMDVUMDI6MjU6NDkuNDMwWiIsInJldGFpbGVyX2Zyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vaW1hZ2UuY2hld3kuY29tL2NhdGFsb2cvZ2VuZXJhbC9pbWFnZXMvbW9lLzA2ODgwZWNiLWJkNWQtNzQ1Zi04MDAwLTgzOGFhZjYwOTRkYi5fVjFfLmpwZyIsInJldGFpbGVyX2Zyb250X2ltYWdlX3NoYTI1NiI6IjYxNjczYjMzM2E1MDM0ZTdjYjgyNzI3MWY3ZDNjNDFkMzg3NTI0YTBjMDVmNTg3NGMzOGNhNTdhNWM4MTIxM2QiLCJtYW51YWxfZnJvbnRfbGFiZWxfb2NyX21hdGNoIjp0cnVlLCJtYW51YWxfZnJvbnRfbGFiZWxfdmlzdWFsX21hdGNoIjp0cnVlLCJyZXRhaWxlcl9mcm9udF9sYWJlbF9vY3IiOiJGUkVFIFdFTExORVNTLiBIRUFMVEhZIFNFTEVDVFMuIFNIUkVEREVEIGwgQm9uZWxlc3MgQ2hpY2tlbiAmIFR1cmtleSBFbnRyZWUgaW4gU2F1Y2UiLCJvZmZpY2lhbF9mcm9udF9sYWJlbF9vY3IiOiJTRUxFQ1RTLSBJUkVEREVEIGwgQm9uZWxlc3MgQ2hpY2tlbiAmIFR1cmtleSBFbnRyZWUgaW4gU2F1Y2UgeWlsbCIsInJlcXVpcmVkX29jcl90ZXJtcyI6WyJzZWxlY3RzIiwiYm9uZWxlc3MgY2hpY2tlbiIsInR1cmtleSBlbnRyZWUiLCJzYXVjZSJdLCJyZXF1aXJlZF90aXRsZV90ZXJtcyI6WyJ3ZWxsbmVzcyIsInNpZ25hdHVyZSBzZWxlY3RzIiwic2hyZWRkZWQiLCJjaGlja2VuIiwidHVya2V5Iiwid2V0IGNhdCBmb29kIl0sInByb3RlY3RlZF9pZGVudGl0eV90ZXJtcyI6WyJzaWduYXR1cmUgc2VsZWN0cyIsInNocmVkZGVkIiwiY2hpY2tlbiIsInR1cmtleSJdLCJvYnNlcnZlZF9pZGVudGl0eSI6eyJicmFuZCI6IldlbGxuZXNzIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoidW5rbm93biIsImZvb2RfZm9ybSI6IndldCJ9LCJ0YXJnZXRfZm9ybXVsYV9rZXkiOiJ3ZWxsbmVzcyBwZXQgY29tcGFueXx3ZWxsbmVzc3x3ZWxsbmVzcyBjb3JlIHNpZ25hdHVyZSBzZWxlY3RzIHNocmVkZGVkIGJvbmVsZXNzIGNoaWNrZW4gYW5kIHR1cmtleSBlbnRyZWUgaW4gc2F1Y2V8Y2F0fHVua25vd258d2V0fGNoaWNrZW4gYW5kIHR1cmtleSBlbnRyZWV8IiwidGFyZ2V0X3NlcnZpbmdfZm9ybXVsYV9rZXkiOiJ3ZWxsbmVzcyBwZXQgY29tcGFueXx3ZWxsbmVzc3x3ZWxsbmVzcyBjb3JlIHNpZ25hdHVyZSBzZWxlY3RzIHNocmVkZGVkIGJvbmVsZXNzIGNoaWNrZW4gYW5kIHR1cmtleSBlbnRyZWUgaW4gc2F1Y2V8Y2F0fHVua25vd258d2V0fGNoaWNrZW4gYW5kIHR1cmtleSBlbnRyZWV8IiwidGFyZ2V0X2lkZW50aXR5Ijp7ImJyYW5kIjoiV2VsbG5lc3MiLCJwcm9kdWN0X25hbWUiOiJXZWxsbmVzcyBDT1JFIFNJR05BVFVSRSBTRUxFQ1RTIFNocmVkZGVkIEJvbmVsZXNzIENoaWNrZW4gJiBUdXJrZXkgRW50csOpZSBpbiBTYXVjZSIsInByb2R1Y3RfbGluZSI6IldlbGxuZXNzIENPUkUgU0lHTkFUVVJFIFNFTEVDVFMgU2hyZWRkZWQgQm9uZWxlc3MgQ2hpY2tlbiAmIFR1cmtleSBFbnRyw6llIGluIFNhdWNlIiwiZmxhdm9yIjoiQ2hpY2tlbiAmIFR1cmtleSBFbnRyw6llIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoidW5rbm93biIsImZvb2RfZm9ybSI6IndldCJ9LCJvZmZpY2lhbF9pbWFnZV91cmwiOiJodHRwczovL2ltYWdlcy5zYWxzaWZ5LmNvbS9pbWFnZS91cGxvYWQvcy0taEpjMjREY04tLS93XzUwMC9mY2MyMThhNzljYjAzODAzMDJkZWRmNjRlYmZmOTAyZDBhMWI4OGVkLmpwZyIsIm9mZmljaWFsX2RhdGFiYXNlX2ltYWdlX3VybCI6Imh0dHBzOi8vaW1hZ2VzLnNhbHNpZnkuY29tL2ltYWdlL3VwbG9hZC9zLS1oSmMyNERjTi0tL3dfNTAwL2ZjYzIxOGE3OWNiMDM4MDMwMmRlZGY2NGViZmY5MDJkMGExYjg4ZWQuanBnIiwib2ZmaWNpYWxfYXJ0aWZhY3RfaW1hZ2Vfc2hhMjU2IjoiNzYwM2RmY2M2M2IwYTBmNjYzMTMwNzc0NGJhNjhhYTRlMzc5ODBkNGVlNjRmMzdiYjIzYjk5MmM1ODkzOTgzYyIsIm9mZmljaWFsX2luZ3JlZGllbnRfY291bnQiOjM0LCJvZmZpY2lhbF9kYXRhYmFzZV9pbmdyZWRpZW50X2hhc2giOiJhNGFhZDU5ODkxNmY3NTI2MThlN2EwZWJiNTAxMWIzMDkwYzE2YWMzNjIwZTQ5MDc0NzBjMGZhZDMwYTI0YmY4Iiwib2ZmaWNpYWxfY2Fub25pY2FsX2luZ3JlZGllbnRfaGFzaCI6ImZjMjQ5OWFhMzEzMTg3Y2Q2MDQ3OGM5NTUxZjM2NzI3YjkxZjg3MTBhOWY1YTlmZmMzYzFhMWEwZDI5N2I4MWUifV0=', 'base64'),
    'utf8'
  )::jsonb;
  v_alias JSONB;
  v_formula public.catalog_formulas%ROWTYPE;
  v_serving public.product_data%ROWTYPE;
  v_target_brand TEXT;
  v_target_pet_type TEXT;
  v_target_life_stage TEXT;
  v_target_food_form TEXT;
  v_normalized_alias TEXT;
  v_review_key TEXT;
  v_observation_id BIGINT;
  v_top_cache TEXT;
BEGIN
  FOR v_alias IN
    SELECT value
    FROM jsonb_array_elements(v_payload)
  LOOP
    v_target_brand := COALESCE(
      v_alias->>'target_brand',
      v_alias#>>'{target_identity,brand}'
    );
    v_target_pet_type := COALESCE(
      v_alias->>'target_pet_type',
      v_alias#>>'{target_identity,pet_type}'
    );
    v_target_life_stage := COALESCE(
      v_alias->>'target_life_stage',
      v_alias#>>'{target_identity,life_stage}'
    );
    v_target_food_form := COALESCE(
      v_alias->>'target_food_form',
      v_alias#>>'{target_identity,food_form}'
    );

    SELECT *
    INTO STRICT v_serving
    FROM public.product_data
    WHERE cache_key = v_alias->>'cache_key'
      AND brand = v_target_brand
      AND pet_type = v_target_pet_type
      AND COALESCE(life_stage, 'unknown') = COALESCE(v_target_life_stage, 'unknown')
      AND COALESCE(food_form, 'unknown') = COALESCE(v_target_food_form, 'unknown')
      AND source_url = v_alias->>'official_source_url'
      AND image_url = COALESCE(
        v_alias->>'official_database_image_url',
        v_alias->>'official_image_url'
      )
      AND ingredient_count = (v_alias->>'official_ingredient_count')::INTEGER
      AND encode(
        digest(
          public.catalog_normalize_ingredient_evidence(ingredient_text),
          'sha256'
        ),
        'hex'
      ) = v_alias->>'official_database_ingredient_hash'
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL;

    SELECT *
    INTO STRICT v_formula
    FROM public.catalog_formulas
    WHERE promoted_cache_key = v_serving.cache_key
      AND source_url = v_alias->>'official_source_url'
      AND front_image_url = COALESCE(
        v_alias->>'official_database_image_url',
        v_alias->>'official_image_url'
      )
      AND cardinality(ingredients) = (v_alias->>'official_ingredient_count')::INTEGER
      AND encode(
        digest(
          public.catalog_normalize_ingredient_evidence(ingredient_text),
          'sha256'
        ),
        'hex'
      ) = v_alias->>'official_database_ingredient_hash'
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND active;

    v_normalized_alias := public.normalize_verified_product_search_query(
      v_alias->>'retailer_title'
    );
    v_review_key := 'deterministic-retailer-identity-wave-wellness-front-label-ocr:'
      || (v_alias->>'retailer_source_slug')
      || ':' || (v_alias->>'retailer_product_id');

    SELECT observation.id
    INTO v_observation_id
    FROM public.catalog_observations observation
    WHERE observation.source_slug = v_alias->>'retailer_source_slug'
      AND observation.source_external_id = v_alias->>'retailer_product_id'
      AND lower(regexp_replace(observation.source_url, '/+$', '')) =
          lower(regexp_replace(v_alias->>'source_url', '/+$', ''))
      AND lower(btrim(observation.product_name)) =
          lower(btrim(v_alias->>'retailer_title'))
    ORDER BY observation.observed_at DESC NULLS LAST, observation.id DESC
    LIMIT 1;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_formula_aliases
      WHERE alias_formula_key = v_alias->>'alias_formula_key'
        AND formula_id <> v_formula.id
    ) THEN
      RAISE EXCEPTION 'Alias already belongs to another formula: %',
        v_alias->>'alias_formula_key';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.catalog_verified_product_search_aliases
      WHERE active
        AND normalized_alias = v_normalized_alias
        AND cache_key <> v_serving.cache_key
    ) THEN
      RAISE EXCEPTION 'Search alias already belongs to another product: %',
        v_alias->>'retailer_title';
    END IF;

    INSERT INTO public.catalog_manual_evidence_reviews (
      review_key,
      target_formula_key,
      corrected_formula_key,
      brand,
      product_name,
      search_query,
      discovery_urls,
      authoritative_source_url,
      authoritative_source_type,
      expected_identity,
      resolved_identity,
      evidence_status,
      quarantine_reason,
      authoritative_content_hash,
      ingredient_text_hash,
      front_image_url_hash,
      observed_at,
      formula_id,
      promoted_cache_key,
      attempt_count,
      review_notes,
      ingredient_evidence_url,
      ingredient_evidence_mode,
      ingredient_original_text_hash,
      ingredient_corrections,
      updated_at
    ) VALUES (
      v_review_key,
      v_alias->>'alias_formula_key',
      v_formula.formula_key,
      v_target_brand,
      v_alias->>'retailer_title',
      v_alias->>'retailer_title',
      jsonb_build_array(
        v_alias->>'source_url',
        v_alias->>'retailer_front_image_url',
        v_alias->>'official_source_url',
        COALESCE(
          v_alias->>'official_database_image_url',
          v_alias->>'official_image_url'
        )
      ),
      v_alias->>'official_source_url',
      'manufacturer_page',
      jsonb_build_object(
        'alias_formula_key', v_alias->>'alias_formula_key',
        'retailer_source_slug', v_alias->>'retailer_source_slug',
        'retailer_product_id', v_alias->>'retailer_product_id',
        'retailer_title', v_alias->>'retailer_title',
        'retailer_source_url', v_alias->>'source_url',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_front_image_url', v_alias->>'retailer_front_image_url',
        'retailer_front_image_sha256',
          v_alias->>'retailer_front_image_sha256',
        'manual_package_image_match',
          COALESCE((v_alias->>'manual_package_image_match')::BOOLEAN, FALSE),
        'manual_front_label_ocr_match',
          COALESCE((v_alias->>'manual_front_label_ocr_match')::BOOLEAN, FALSE),
        'manual_front_label_visual_match',
          COALESCE((v_alias->>'manual_front_label_visual_match')::BOOLEAN, FALSE),
        'retailer_front_label_ocr', v_alias->>'retailer_front_label_ocr',
        'official_front_label_ocr', v_alias->>'official_front_label_ocr',
        'required_ocr_terms', COALESCE(v_alias->'required_ocr_terms', '[]'::jsonb),
        'required_title_terms',
          COALESCE(v_alias->'required_title_terms', '[]'::jsonb),
        'protected_identity_terms',
          COALESCE(v_alias->'protected_identity_terms', '[]'::jsonb),
        'retailer_package_identifier',
          v_alias->>'retailer_package_identifier',
        'official_package_identifier',
          v_alias->>'official_package_identifier',
        'target_cache_key', v_serving.cache_key,
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-wellness-front-label-ocr/report.json'
      ),
      jsonb_build_object(
        'formula_id', v_formula.id,
        'formula_key', v_formula.formula_key,
        'cache_key', v_serving.cache_key,
        'official_source_url', v_alias->>'official_source_url',
        'official_image_url', COALESCE(
          v_alias->>'official_database_image_url',
          v_alias->>'official_image_url'
        ),
        'official_ingredient_count',
          (v_alias->>'official_ingredient_count')::INTEGER,
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'official_canonical_ingredient_hash',
          v_alias->>'official_canonical_ingredient_hash',
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-wellness-front-label-ocr/report.json'
      ),
      'staged',
      NULL,
      encode(digest(
        (v_alias->>'source_url') || '|' ||
        (v_alias->>'retailer_title') || '|' ||
        (v_alias->>'official_source_url') || '|' ||
        (v_alias->>'official_database_ingredient_hash'),
        'sha256'
      ), 'hex'),
      v_alias->>'official_canonical_ingredient_hash',
      encode(digest(COALESCE(
        v_alias->>'official_database_image_url',
        v_alias->>'official_image_url'
      ), 'sha256'), 'hex'),
      (v_alias->>'retailer_observed_at')::TIMESTAMPTZ,
      NULL,
      v_serving.cache_key,
      1,
      'Exact retailer identity staged for reconciliation to one manufacturer-current formula. Retailer evidence is identity-only and does not verify ingredients or images.',
      v_alias->>'official_source_url',
      'source_text_exact',
      v_alias->>'official_database_ingredient_hash',
      '[]'::jsonb,
      NOW()
    )
    ON CONFLICT (review_key) DO UPDATE
    SET target_formula_key = EXCLUDED.target_formula_key,
        corrected_formula_key = EXCLUDED.corrected_formula_key,
        discovery_urls = EXCLUDED.discovery_urls,
        authoritative_source_url = EXCLUDED.authoritative_source_url,
        expected_identity = EXCLUDED.expected_identity,
        resolved_identity = EXCLUDED.resolved_identity,
        evidence_status = 'staged',
        quarantine_reason = NULL,
        authoritative_content_hash = EXCLUDED.authoritative_content_hash,
        ingredient_text_hash = EXCLUDED.ingredient_text_hash,
        front_image_url_hash = EXCLUDED.front_image_url_hash,
        observed_at = EXCLUDED.observed_at,
        formula_id = NULL,
        promoted_cache_key = EXCLUDED.promoted_cache_key,
        attempt_count = public.catalog_manual_evidence_reviews.attempt_count + 1,
        review_notes = EXCLUDED.review_notes,
        ingredient_evidence_url = EXCLUDED.ingredient_evidence_url,
        ingredient_evidence_mode = EXCLUDED.ingredient_evidence_mode,
        ingredient_original_text_hash = EXCLUDED.ingredient_original_text_hash,
        ingredient_corrections = EXCLUDED.ingredient_corrections,
        updated_at = NOW();

    INSERT INTO public.catalog_formula_aliases (
      alias_formula_key,
      formula_id,
      identity_hash,
      match_reason,
      source_url,
      metadata,
      updated_at
    ) VALUES (
      v_alias->>'alias_formula_key',
      v_formula.id,
      v_formula.identity_hash,
      'manual_review',
      v_alias->>'source_url',
      jsonb_build_object(
        'reason', v_alias->>'review_reason',
        'review_method', v_alias->>'review_method',
        'reviewed_at', v_alias->>'reviewed_at',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_source_slug', v_alias->>'retailer_source_slug',
        'retailer_product_id', v_alias->>'retailer_product_id',
        'retailer_title', v_alias->>'retailer_title',
        'retailer_observed_at', v_alias->>'retailer_observed_at',
        'retailer_front_image_url', v_alias->>'retailer_front_image_url',
        'retailer_front_image_sha256', v_alias->>'retailer_front_image_sha256',
        'manual_package_image_match',
          COALESCE((v_alias->>'manual_package_image_match')::BOOLEAN, FALSE),
        'manual_front_label_ocr_match',
          COALESCE((v_alias->>'manual_front_label_ocr_match')::BOOLEAN, FALSE),
        'manual_front_label_visual_match',
          COALESCE((v_alias->>'manual_front_label_visual_match')::BOOLEAN, FALSE),
        'required_ocr_terms', COALESCE(v_alias->'required_ocr_terms', '[]'::jsonb),
        'required_title_terms',
          COALESCE(v_alias->'required_title_terms', '[]'::jsonb),
        'protected_identity_terms',
          COALESCE(v_alias->'protected_identity_terms', '[]'::jsonb),
        'retailer_front_label_ocr', v_alias->>'retailer_front_label_ocr',
        'official_front_label_ocr', v_alias->>'official_front_label_ocr',
        'retailer_package_identifier',
          v_alias->>'retailer_package_identifier',
        'official_package_identifier',
          v_alias->>'official_package_identifier',
        'official_artifact_image_sha256',
          v_alias->>'official_artifact_image_sha256',
        'official_source_url', v_alias->>'official_source_url',
        'official_ingredient_hash', v_alias->>'official_canonical_ingredient_hash',
        'official_canonical_ingredient_hash',
          v_alias->>'official_canonical_ingredient_hash',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'package_size_is_sku_only', TRUE,
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-wellness-front-label-ocr/report.json'
      ),
      NOW()
    )
    ON CONFLICT (alias_formula_key) DO UPDATE
    SET source_url = EXCLUDED.source_url,
        metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
        updated_at = NOW()
    WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

    INSERT INTO public.catalog_verified_product_search_aliases (
      cache_key,
      alias_text,
      normalized_alias,
      source_url,
      source_authority,
      evidence_observed_at,
      provenance,
      active,
      updated_at
    ) VALUES (
      v_serving.cache_key,
      v_alias->>'retailer_title',
      v_normalized_alias,
      v_alias->>'source_url',
      'retailer_identity',
      (v_alias->>'retailer_observed_at')::TIMESTAMPTZ,
      jsonb_build_object(
        'review_key', v_review_key,
        'review_method', v_alias->>'review_method',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_source_slug', v_alias->>'retailer_source_slug',
        'retailer_product_id', v_alias->>'retailer_product_id',
        'manual_package_image_match',
          COALESCE((v_alias->>'manual_package_image_match')::BOOLEAN, FALSE),
        'manual_front_label_ocr_match',
          COALESCE((v_alias->>'manual_front_label_ocr_match')::BOOLEAN, FALSE),
        'manual_front_label_visual_match',
          COALESCE((v_alias->>'manual_front_label_visual_match')::BOOLEAN, FALSE),
        'formula_id', v_formula.id,
        'official_source_url', v_alias->>'official_source_url',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-wellness-front-label-ocr/report.json'
      ),
      TRUE,
      NOW()
    )
    ON CONFLICT (normalized_alias) WHERE active DO UPDATE
    SET cache_key = EXCLUDED.cache_key,
        alias_text = EXCLUDED.alias_text,
        source_url = EXCLUDED.source_url,
        source_authority = EXCLUDED.source_authority,
        evidence_observed_at = EXCLUDED.evidence_observed_at,
        provenance = public.catalog_verified_product_search_aliases.provenance
          || EXCLUDED.provenance,
        updated_at = NOW()
    WHERE public.catalog_verified_product_search_aliases.cache_key =
      EXCLUDED.cache_key;

    INSERT INTO public.catalog_field_evidence (
      formula_id,
      observation_id,
      field_name,
      field_value,
      source_url,
      source_authority,
      accepted,
      observed_at,
      content_hash
    ) VALUES (
      v_formula.id,
      v_observation_id,
      'retailer_exact_identity_alias',
      jsonb_build_object(
        'review_key', v_review_key,
        'alias_formula_key', v_alias->>'alias_formula_key',
        'review_method', v_alias->>'review_method',
        'retailer_identity_only', TRUE,
        'retailer_ingredient_verification', FALSE,
        'retailer_source_slug', v_alias->>'retailer_source_slug',
        'retailer_product_id', v_alias->>'retailer_product_id',
        'retailer_title', v_alias->>'retailer_title',
        'retailer_front_image_url', v_alias->>'retailer_front_image_url',
        'retailer_front_image_sha256',
          v_alias->>'retailer_front_image_sha256',
        'manual_package_image_match',
          COALESCE((v_alias->>'manual_package_image_match')::BOOLEAN, FALSE),
        'manual_front_label_ocr_match',
          COALESCE((v_alias->>'manual_front_label_ocr_match')::BOOLEAN, FALSE),
        'manual_front_label_visual_match',
          COALESCE((v_alias->>'manual_front_label_visual_match')::BOOLEAN, FALSE),
        'retailer_front_label_ocr', v_alias->>'retailer_front_label_ocr',
        'official_front_label_ocr', v_alias->>'official_front_label_ocr',
        'required_ocr_terms', COALESCE(v_alias->'required_ocr_terms', '[]'::jsonb),
        'required_title_terms',
          COALESCE(v_alias->'required_title_terms', '[]'::jsonb),
        'protected_identity_terms',
          COALESCE(v_alias->'protected_identity_terms', '[]'::jsonb),
        'retailer_package_identifier',
          v_alias->>'retailer_package_identifier',
        'official_package_identifier',
          v_alias->>'official_package_identifier',
        'official_source_url', v_alias->>'official_source_url',
        'official_database_ingredient_hash',
          v_alias->>'official_database_ingredient_hash',
        'official_canonical_ingredient_hash',
          v_alias->>'official_canonical_ingredient_hash',
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260805-wellness-front-label-ocr/report.json'
      ),
      v_alias->>'source_url',
      'retailer_identity',
      TRUE,
      (v_alias->>'retailer_observed_at')::TIMESTAMPTZ,
      encode(digest(
        v_formula.id::TEXT || '|retailer_exact_identity_alias|' ||
        (v_alias->>'alias_formula_key') || '|' ||
        (v_alias->>'source_url') || '|' ||
        (v_alias->>'official_database_ingredient_hash'),
        'sha256'
      ), 'hex')
    )
    ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
    SET observation_id = EXCLUDED.observation_id,
        field_value = EXCLUDED.field_value,
        source_authority = EXCLUDED.source_authority,
        accepted = TRUE,
        observed_at = EXCLUDED.observed_at;

    UPDATE public.catalog_manual_evidence_reviews
    SET evidence_status = 'promoted',
        formula_id = v_formula.id,
        corrected_formula_key = v_formula.formula_key,
        promoted_cache_key = v_serving.cache_key,
        review_notes = review_notes ||
          ' Reconciliation, field evidence, and exact-title search alias promoted; serving evidence unchanged.',
        updated_at = NOW()
    WHERE review_key = v_review_key
      AND evidence_status = 'staged';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Staged evidence review did not promote: %', v_review_key;
    END IF;

    SELECT result.cache_key
    INTO v_top_cache
    FROM public.search_verified_products(v_alias->>'retailer_title', 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache IS DISTINCT FROM v_serving.cache_key THEN
      RAISE EXCEPTION 'Exact-title search regression for %: expected %, got %',
        v_alias->>'retailer_product_id', v_serving.cache_key, v_top_cache;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.catalog_formula_aliases
      WHERE metadata->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-wellness-front-label-ocr/report.json') <>
      jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_manual_evidence_reviews
         WHERE review_key LIKE
           'deterministic-retailer-identity-wave-wellness-front-label-ocr:%'
           AND evidence_status = 'promoted'
           AND formula_id IS NOT NULL) <> jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_verified_product_search_aliases
         WHERE active
           AND provenance->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-wellness-front-label-ocr/report.json') <>
           jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_field_evidence
         WHERE accepted
           AND field_name = 'retailer_exact_identity_alias'
           AND field_value->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260805-wellness-front-label-ocr/report.json') <>
           jsonb_array_length(v_payload) THEN
    RAISE EXCEPTION 'Wave wellness-front-label-ocr evidence promotion postcondition failed';
  END IF;
END
$migration$;
