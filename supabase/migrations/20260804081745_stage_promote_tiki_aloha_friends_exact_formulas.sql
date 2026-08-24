-- Stage and promote five exact current Tiki Cat Aloha Friends formulas
-- from refreshed official manufacturer pages. Each page exposes one exact
-- recipe, a full ingredient statement, a matching front-package image, and
-- complete-food evidence. Recipe proteins remain hard identity boundaries.
--
-- The PetSmart Chicken & Pumpkin package is reconciled only after its exact
-- ingredient statement and protected identity agree with the manufacturer
-- formula. Its retailer source version and GTIN remain preserved.

DO $migration$
DECLARE
  v_run JSONB :=
    convert_from(decode('eyJydW5fa2V5IjoidGlraS1wZXRzOmJvdW5kZWQtZXhhY3QtZXZpZGVuY2U6YWxvaGEtZnJpZW5kczoyMDI2MDgwNDp2MSIsInNvdXJjZV9zbHVnIjoidGlraS1wZXRzIiwic291cmNlX3R5cGUiOiJtYW51ZmFjdHVyZXIiLCJjb3ZlcmFnZV9yb2xlIjoidmVyaWZpY2F0aW9uIiwic3RhdHVzIjoiY29tcGxldGVkIiwic3RhcnRlZF9hdCI6IjIwMjYtMDgtMDRUMDg6MjA6MDVaIiwiZXhwZWN0ZWRfY291bnQiOjUsInBhZ2luYXRpb25fY29tcGxldGUiOnRydWUsInRydW5jYXRlZCI6ZmFsc2UsImNhcF9yZWFjaGVkIjpmYWxzZSwic291cmNlX2NvbnRlbnRfaGFzaCI6IjI2Mzk0YjJiMjQ3OWFjZGMxMmVmM2JlNWU4M2U0OTJkNDA3MTFhNWRjOWQ1NTExZTRmYjYzZjkxZDdlM2MxOTEiLCJjaGVja3BvaW50Ijp7ImZlZWRfcm93X2NvdW50Ijo1LCJhY2NlcHRlZF9vYnNlcnZhdGlvbl9jb3VudCI6NSwiY2Fub25pY2FsX2Zvcm11bGFfY291bnQiOjV9LCJtZXRhZGF0YSI6eyJicmFuZCI6IlRpa2kgQ2F0IiwibWFudWZhY3R1cmVyIjoiV2hpdGVicmlkZ2UgUGV0IEJyYW5kcyIsInNvdXJjZV9hdXRob3JpdHkiOiJtYW51ZmFjdHVyZXIiLCJib3VuZGVkX2V4YWN0X2V2aWRlbmNlIjp0cnVlLCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlLCJwYWNrYWdlX3NpemVfaXNfc2t1X29ubHkiOnRydWUsImN1cnJlbnRfb2ZmaWNpYWxfcGFnZV9yZWZyZXNoIjp0cnVlfX0=', 'base64'), 'UTF8')::JSONB;
  v_payload JSONB :=
    convert_from(decode('W3siZm9ybXVsYV9rZXkiOiJ3aGl0ZWJyaWRnZSBwZXQgYnJhbmRzfHRpa2kgY2F0fGFsb2hhIGZyaWVuZHN8Y2F0fHVua25vd258d2V0fGNoaWNrZW4gcHVtcGtpbiBkdWNrIHJlY2lwZSBpbiBicm90aHwiLCJpZGVudGl0eV9oYXNoIjoiMmY2NTY2ODJkMmQwNDJhN2I0NWUxZWQzYjk1YTc1ZTI1ZWQzNzdlZTZkNmJlMTVjZmI1NDg1OTkwN2QxZjc4OSIsIm1hbnVmYWN0dXJlciI6IldoaXRlYnJpZGdlIFBldCBCcmFuZHMiLCJicmFuZCI6IlRpa2kgQ2F0IiwicHJvZHVjdF9uYW1lIjoiQ2hpY2tlbiwgUHVtcGtpbiAmIER1Y2sgUmVjaXBlIGluIEJyb3RoIiwicHJvZHVjdF9saW5lIjoiQWxvaGEgRnJpZW5kcyIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6InVua25vd24iLCJmb29kX2Zvcm0iOiJ3ZXQiLCJmbGF2b3IiOiJDaGlja2VuLCBQdW1wa2luICYgRHVjayBSZWNpcGUgaW4gQnJvdGgiLCJkaWV0X2NvbmRpdGlvbiI6IiIsInNvdXJjZV9zbHVnIjoidGlraS1wZXRzIiwic291cmNlX2V4dGVybmFsX2lkIjoidGlraS1wZXRzOnRpa2kgY2F0IGNoaWNrZW4gcHVtcGtpbiBkdWNrIHJlY2lwZSBpbiBicm90aCBhbG9oYS1mcmllbmRzIGNoaWNrZW4tcHVtcGtpbi1kdWNrLXJlY2lwZS1pbi1icm90aCIsInNvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9hbG9oYS1mcmllbmRzL2NoaWNrZW4tcHVtcGtpbi1kdWNrLXJlY2lwZS1pbi1icm90aC8iLCJzb3VyY2VfYXV0aG9yaXR5IjoibWFudWZhY3R1cmVyIiwiZ3RpbiI6IiIsInBhY2thZ2Vfc2l6ZSI6IiIsImluZ3JlZGllbnRfdGV4dCI6IkNoaWNrZW4sIGNoaWNrZW4gYnJvdGgsIHB1bXBraW4sIGR1Y2ssIGRpY2FsY2l1bSBwaG9zcGhhdGUsIHhhbnRoYW4gZ3VtLCBwb3Rhc3NpdW0gY2hsb3JpZGUsIGNob2xpbmUgY2hsb3JpZGUsIHNhbHQsIG1hZ25lc2l1bSBzdWxmYXRlLCB0YXVyaW5lLCB6aW5jIHN1bGZhdGUsIG5pYWNpbiAodml0YW1pbiBCMyksIHZpdGFtaW4gRSBzdXBwbGVtZW50LCBmZXJyb3VzIHN1bGZhdGUsIG1hbmdhbmVzZSBzdWxmYXRlLCB0aGlhbWluZSBtb25vbml0cmF0ZSAodml0YW1pbiBCMSksIHZpdGFtaW4gQSBzdXBwbGVtZW50LCBjYWxjaXVtIHBhbnRvdGhlbmF0ZSwgc29kaXVtIHNlbGVuaXRlLCBjb3BwZXIgYW1pbm8gYWNpZCBjb21wbGV4LCBweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpLCByaWJvZmxhdmluIHN1cHBsZW1lbnQgKHZpdGFtaW4gQjIpLCBmb2xpYyBhY2lkLCB2aXRhbWluIEQzIHN1cHBsZW1lbnQsIGJpb3Rpbiwgdml0YW1pbiBCMTIgc3VwcGxlbWVudC4iLCJpbmdyZWRpZW50cyI6WyJDaGlja2VuIiwiY2hpY2tlbiBicm90aCIsInB1bXBraW4iLCJkdWNrIiwiZGljYWxjaXVtIHBob3NwaGF0ZSIsInhhbnRoYW4gZ3VtIiwicG90YXNzaXVtIGNobG9yaWRlIiwiY2hvbGluZSBjaGxvcmlkZSIsInNhbHQiLCJtYWduZXNpdW0gc3VsZmF0ZSIsInRhdXJpbmUiLCJ6aW5jIHN1bGZhdGUiLCJuaWFjaW4gKHZpdGFtaW4gQjMpIiwidml0YW1pbiBFIHN1cHBsZW1lbnQiLCJmZXJyb3VzIHN1bGZhdGUiLCJtYW5nYW5lc2Ugc3VsZmF0ZSIsInRoaWFtaW5lIG1vbm9uaXRyYXRlICh2aXRhbWluIEIxKSIsInZpdGFtaW4gQSBzdXBwbGVtZW50IiwiY2FsY2l1bSBwYW50b3RoZW5hdGUiLCJzb2RpdW0gc2VsZW5pdGUiLCJjb3BwZXIgYW1pbm8gYWNpZCBjb21wbGV4IiwicHlyaWRveGluZSBoeWRyb2NobG9yaWRlICh2aXRhbWluIEI2KSIsInJpYm9mbGF2aW4gc3VwcGxlbWVudCAodml0YW1pbiBCMikiLCJmb2xpYyBhY2lkIiwidml0YW1pbiBEMyBzdXBwbGVtZW50IiwiYmlvdGluIiwidml0YW1pbiBCMTIgc3VwcGxlbWVudCJdLCJmcm9udF9pbWFnZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS93cC1jb250ZW50L3VwbG9hZHMvMjAxOC8wNi9mcmllbmRzX2NoaWNrZW5fZHVja2Zyb250LnBuZyIsImlzX2NvbXBsZXRlX2Zvb2QiOnRydWUsImF2YWlsYWJsZV9pbl91cyI6dHJ1ZSwicHJvdGVjdGVkX3Rlcm1zIjpbIlRpa2kgQ2F0IiwiQWxvaGEgRnJpZW5kcyIsIkNoaWNrZW4iLCJQdW1wa2luIiwiRHVjayIsIlJlY2lwZSBpbiBCcm90aCIsImNhdCIsIndldCJdLCJvYnNlcnZlZF9hdCI6IjIwMjYtMDgtMDRUMDg6MjA6MDVaIiwiY29udGVudF9oYXNoIjoiMWQxNDBmMDA4NTkwOGJlMWRkZDUwMTdlMWQ1MjMzMjYyMjMwZDU0YTZiYzY0NTcxN2RiYjk0MDc5OTY0MmYxNCIsInZhbGlkYXRpb25fc3RhdHVzIjoiYWNjZXB0ZWQiLCJ2YWxpZGF0aW9uX3JlYXNvbnMiOltdLCJpbmdyZWRpZW50X3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJtYW51ZmFjdHVyZXIiLCJpbWFnZV92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2VfdGllciI6InRpZXJfMV91c19yZXRhaWwiLCJmb3JtdWxhX2V2aWRlbmNlX3RpZXIiOiJtYW51ZmFjdHVyZXJfY3VycmVudF9leGFjdCIsImZvcm11bGFfdmVyc2lvbl9wcm92ZW5hbmNlIjp7InZlcnNpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyX2N1cnJlbnQiLCJzb3VyY2UiOiJ0aWtpLXBldHMiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vcHJvZHVjdC90aWtpLWNhdC90aWtpLWNhdC13ZXQtZm9vZC9zaHJlZGRlZC1jYXQvYWxvaGEtZnJpZW5kcy9jaGlja2VuLXB1bXBraW4tZHVjay1yZWNpcGUtaW4tYnJvdGgvIiwiY2FwdHVyZWRfYXQiOiIyMDI2LTA4LTA0VDA4OjIwOjA1WiIsImluZ3JlZGllbnRfdGV4dF9oYXNoIjoiOGU4YzNiNWMyNDY2MzMyYTFmYmJlZWJkZjE0ZjUzNmYxNjgzOGQ4NTQwZWQ4OTIyZGY1OWRiYWJhODFkMTMyYSIsImZyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3dwLWNvbnRlbnQvdXBsb2Fkcy8yMDE4LzA2L2ZyaWVuZHNfY2hpY2tlbl9kdWNrZnJvbnQucG5nIiwiZXhhY3RfZm9ybXVsYV9ldmlkZW5jZSI6dHJ1ZX0sInJhd19wYXlsb2FkIjp7ImNhY2hlX2tleSI6InRpa2ktcGV0czp0aWtpIGNhdCBjaGlja2VuIHB1bXBraW4gZHVjayByZWNpcGUgaW4gYnJvdGggYWxvaGEtZnJpZW5kcyBjaGlja2VuLXB1bXBraW4tZHVjay1yZWNpcGUtaW4tYnJvdGgiLCJpbmdyZWRpZW50X3NvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9hbG9oYS1mcmllbmRzL2NoaWNrZW4tcHVtcGtpbi1kdWNrLXJlY2lwZS1pbi1icm90aC8iLCJpbWFnZV9zb3VyY2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vcHJvZHVjdC90aWtpLWNhdC90aWtpLWNhdC13ZXQtZm9vZC9zaHJlZGRlZC1jYXQvYWxvaGEtZnJpZW5kcy9jaGlja2VuLXB1bXBraW4tZHVjay1yZWNpcGUtaW4tYnJvdGgvIiwiY2Fub25pY2FsX2Zvcm11bGFfaWRlbnRpdHkiOnsibWFudWZhY3R1cmVyIjoid2hpdGVicmlkZ2UgcGV0IGJyYW5kcyIsImJyYW5kIjoidGlraSBjYXQiLCJwcm9kdWN0X2xpbmUiOiJhbG9oYSBmcmllbmRzIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoidW5rbm93biIsImZvb2RfZm9ybSI6IndldCIsImZsYXZvciI6ImNoaWNrZW4gcHVtcGtpbiBkdWNrIHJlY2lwZSBpbiBicm90aCIsImRpZXRfY29uZGl0aW9uIjoiIn0sImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWUsInBhY2thZ2Vfc2l6ZV9pc19za3Vfb25seSI6dHJ1ZSwiY3VycmVudF9vZmZpY2lhbF9wYWdlX3JlZnJlc2giOnRydWV9fSx7ImZvcm11bGFfa2V5Ijoid2hpdGVicmlkZ2UgcGV0IGJyYW5kc3x0aWtpIGNhdHxhbG9oYSBmcmllbmRzfGNhdHx1bmtub3dufHdldHxjaGlja2VuIHB1bXBraW4gbGFtYiByZWNpcGUgaW4gYnJvdGh8IiwiaWRlbnRpdHlfaGFzaCI6IjIzMDM4M2I0NDExMDBhNTkxMjg2ODM3N2YxN2YwMTJmYzhkM2IyMGQ2MGE2OGVmYmYyNTNjYWQyMTJjNmE1OWIiLCJtYW51ZmFjdHVyZXIiOiJXaGl0ZWJyaWRnZSBQZXQgQnJhbmRzIiwiYnJhbmQiOiJUaWtpIENhdCIsInByb2R1Y3RfbmFtZSI6IkNoaWNrZW4sIFB1bXBraW4gJiBMYW1iIFJlY2lwZSBpbiBCcm90aCIsInByb2R1Y3RfbGluZSI6IkFsb2hhIEZyaWVuZHMiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJ1bmtub3duIiwiZm9vZF9mb3JtIjoid2V0IiwiZmxhdm9yIjoiQ2hpY2tlbiwgUHVtcGtpbiAmIExhbWIgUmVjaXBlIGluIEJyb3RoIiwiZGlldF9jb25kaXRpb24iOiIiLCJzb3VyY2Vfc2x1ZyI6InRpa2ktcGV0cyIsInNvdXJjZV9leHRlcm5hbF9pZCI6InRpa2ktcGV0czp0aWtpIGNhdCBjaGlja2VuIHB1bXBraW4gbGFtYiByZWNpcGUgaW4gYnJvdGggYWxvaGEtZnJpZW5kcyBjaGlja2VuLXB1bXBraW4tbGFtYi1yZWNpcGUtaW4tYnJvdGgiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vcHJvZHVjdC90aWtpLWNhdC90aWtpLWNhdC13ZXQtZm9vZC9zaHJlZGRlZC1jYXQvYWxvaGEtZnJpZW5kcy9jaGlja2VuLXB1bXBraW4tbGFtYi1yZWNpcGUtaW4tYnJvdGgvIiwic291cmNlX2F1dGhvcml0eSI6Im1hbnVmYWN0dXJlciIsImd0aW4iOiIiLCJwYWNrYWdlX3NpemUiOiIiLCJpbmdyZWRpZW50X3RleHQiOiJDaGlja2VuLCBjaGlja2VuIGJyb3RoLCBwdW1wa2luLCBsYW1iLCBkaWNhbGNpdW0gcGhvc3BoYXRlLCB4YW50aGFuIGd1bSwgcG90YXNzaXVtIGNobG9yaWRlLCBjaG9saW5lIGNobG9yaWRlLCBzYWx0LCBtYWduZXNpdW0gc3VsZmF0ZSwgdGF1cmluZSwgemluYyBzdWxmYXRlLCBuaWFjaW4gKHZpdGFtaW4gQjMpLCB2aXRhbWluIEUgc3VwcGxlbWVudCwgZmVycm91cyBzdWxmYXRlLCBtYW5nYW5lc2Ugc3VsZmF0ZSwgdGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpLCB2aXRhbWluIEEgc3VwcGxlbWVudCwgY2FsY2l1bSBwYW50b3RoZW5hdGUsIHNvZGl1bSBzZWxlbml0ZSwgY29wcGVyIGFtaW5vIGFjaWQgY29tcGxleCwgcHlyaWRveGluZSBoeWRyb2NobG9yaWRlICh2aXRhbWluIEI2KSwgcmlib2ZsYXZpbiBzdXBwbGVtZW50ICh2aXRhbWluIEIyKSwgZm9saWMgYWNpZCwgdml0YW1pbiBEMyBzdXBwbGVtZW50LCBiaW90aW4sIHZpdGFtaW4gQjEyIHN1cHBsZW1lbnQuIiwiaW5ncmVkaWVudHMiOlsiQ2hpY2tlbiIsImNoaWNrZW4gYnJvdGgiLCJwdW1wa2luIiwibGFtYiIsImRpY2FsY2l1bSBwaG9zcGhhdGUiLCJ4YW50aGFuIGd1bSIsInBvdGFzc2l1bSBjaGxvcmlkZSIsImNob2xpbmUgY2hsb3JpZGUiLCJzYWx0IiwibWFnbmVzaXVtIHN1bGZhdGUiLCJ0YXVyaW5lIiwiemluYyBzdWxmYXRlIiwibmlhY2luICh2aXRhbWluIEIzKSIsInZpdGFtaW4gRSBzdXBwbGVtZW50IiwiZmVycm91cyBzdWxmYXRlIiwibWFuZ2FuZXNlIHN1bGZhdGUiLCJ0aGlhbWluZSBtb25vbml0cmF0ZSAodml0YW1pbiBCMSkiLCJ2aXRhbWluIEEgc3VwcGxlbWVudCIsImNhbGNpdW0gcGFudG90aGVuYXRlIiwic29kaXVtIHNlbGVuaXRlIiwiY29wcGVyIGFtaW5vIGFjaWQgY29tcGxleCIsInB5cmlkb3hpbmUgaHlkcm9jaGxvcmlkZSAodml0YW1pbiBCNikiLCJyaWJvZmxhdmluIHN1cHBsZW1lbnQgKHZpdGFtaW4gQjIpIiwiZm9saWMgYWNpZCIsInZpdGFtaW4gRDMgc3VwcGxlbWVudCIsImJpb3RpbiIsInZpdGFtaW4gQjEyIHN1cHBsZW1lbnQiXSwiZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vd3AtY29udGVudC91cGxvYWRzLzIwMTgvMDkvZnJpZW5kc19jaGlja2VuX2xhbWJmcm9udC5wbmciLCJpc19jb21wbGV0ZV9mb29kIjp0cnVlLCJhdmFpbGFibGVfaW5fdXMiOnRydWUsInByb3RlY3RlZF90ZXJtcyI6WyJUaWtpIENhdCIsIkFsb2hhIEZyaWVuZHMiLCJDaGlja2VuIiwiUHVtcGtpbiIsIkxhbWIiLCJSZWNpcGUgaW4gQnJvdGgiLCJjYXQiLCJ3ZXQiXSwib2JzZXJ2ZWRfYXQiOiIyMDI2LTA4LTA0VDA4OjIwOjA1WiIsImNvbnRlbnRfaGFzaCI6IjE0NWVjZDg2MTk4MjVmMDA2ODQ1YThhOWNmNDZkYmMxZThkNDVjMmY1OTgzMTc2NDU0ZjkyNTQ3NWJkMzY0YWYiLCJ2YWxpZGF0aW9uX3N0YXR1cyI6ImFjY2VwdGVkIiwidmFsaWRhdGlvbl9yZWFzb25zIjpbXSwiaW5ncmVkaWVudF92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiaW1hZ2VfdmVyaWZpY2F0aW9uX3N0YXR1cyI6Im1hbnVmYWN0dXJlciIsImNvdmVyYWdlX3RpZXIiOiJ0aWVyXzFfdXNfcmV0YWlsIiwiZm9ybXVsYV9ldmlkZW5jZV90aWVyIjoibWFudWZhY3R1cmVyX2N1cnJlbnRfZXhhY3QiLCJmb3JtdWxhX3ZlcnNpb25fcHJvdmVuYW5jZSI6eyJ2ZXJzaW9uX3N0YXR1cyI6Im1hbnVmYWN0dXJlcl9jdXJyZW50Iiwic291cmNlIjoidGlraS1wZXRzIiwic291cmNlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3Byb2R1Y3QvdGlraS1jYXQvdGlraS1jYXQtd2V0LWZvb2Qvc2hyZWRkZWQtY2F0L2Fsb2hhLWZyaWVuZHMvY2hpY2tlbi1wdW1wa2luLWxhbWItcmVjaXBlLWluLWJyb3RoLyIsImNhcHR1cmVkX2F0IjoiMjAyNi0wOC0wNFQwODoyMDowNVoiLCJpbmdyZWRpZW50X3RleHRfaGFzaCI6IjM0OTg4NGQxYmM2YjllZjY4N2U5NTJiNjY5NjRmOTg3ZDkwNGU0OGI2YjZjMTQ4N2FjNTA3ZDFiNTFlOGVhNzYiLCJmcm9udF9pbWFnZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS93cC1jb250ZW50L3VwbG9hZHMvMjAxOC8wOS9mcmllbmRzX2NoaWNrZW5fbGFtYmZyb250LnBuZyIsImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWV9LCJyYXdfcGF5bG9hZCI6eyJjYWNoZV9rZXkiOiJ0aWtpLXBldHM6dGlraSBjYXQgY2hpY2tlbiBwdW1wa2luIGxhbWIgcmVjaXBlIGluIGJyb3RoIGFsb2hhLWZyaWVuZHMgY2hpY2tlbi1wdW1wa2luLWxhbWItcmVjaXBlLWluLWJyb3RoIiwiaW5ncmVkaWVudF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vcHJvZHVjdC90aWtpLWNhdC90aWtpLWNhdC13ZXQtZm9vZC9zaHJlZGRlZC1jYXQvYWxvaGEtZnJpZW5kcy9jaGlja2VuLXB1bXBraW4tbGFtYi1yZWNpcGUtaW4tYnJvdGgvIiwiaW1hZ2Vfc291cmNlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3Byb2R1Y3QvdGlraS1jYXQvdGlraS1jYXQtd2V0LWZvb2Qvc2hyZWRkZWQtY2F0L2Fsb2hhLWZyaWVuZHMvY2hpY2tlbi1wdW1wa2luLWxhbWItcmVjaXBlLWluLWJyb3RoLyIsImNhbm9uaWNhbF9mb3JtdWxhX2lkZW50aXR5Ijp7Im1hbnVmYWN0dXJlciI6IndoaXRlYnJpZGdlIHBldCBicmFuZHMiLCJicmFuZCI6InRpa2kgY2F0IiwicHJvZHVjdF9saW5lIjoiYWxvaGEgZnJpZW5kcyIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6InVua25vd24iLCJmb29kX2Zvcm0iOiJ3ZXQiLCJmbGF2b3IiOiJjaGlja2VuIHB1bXBraW4gbGFtYiByZWNpcGUgaW4gYnJvdGgiLCJkaWV0X2NvbmRpdGlvbiI6IiJ9LCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlLCJwYWNrYWdlX3NpemVfaXNfc2t1X29ubHkiOnRydWUsImN1cnJlbnRfb2ZmaWNpYWxfcGFnZV9yZWZyZXNoIjp0cnVlfX0seyJmb3JtdWxhX2tleSI6IndoaXRlYnJpZGdlIHBldCBicmFuZHN8dGlraSBjYXR8YWxvaGEgZnJpZW5kc3xjYXR8dW5rbm93bnx3ZXR8Y2hpY2tlbiBwdW1wa2luIHJlY2lwZSBpbiBicm90aHwiLCJpZGVudGl0eV9oYXNoIjoiOTQzMjAyMGU3MzU0OGE1ZDEyOWVkYjg2ODQ2ZTViOTg4OTUyMDIyZTQ5NmQ4MTcyNzk2MjQxY2Y1NzA2NmVlZCIsIm1hbnVmYWN0dXJlciI6IldoaXRlYnJpZGdlIFBldCBCcmFuZHMiLCJicmFuZCI6IlRpa2kgQ2F0IiwicHJvZHVjdF9uYW1lIjoiQ2hpY2tlbiAmIFB1bXBraW4gUmVjaXBlIGluIEJyb3RoIiwicHJvZHVjdF9saW5lIjoiQWxvaGEgRnJpZW5kcyIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6InVua25vd24iLCJmb29kX2Zvcm0iOiJ3ZXQiLCJmbGF2b3IiOiJDaGlja2VuICYgUHVtcGtpbiBSZWNpcGUgaW4gQnJvdGgiLCJkaWV0X2NvbmRpdGlvbiI6IiIsInNvdXJjZV9zbHVnIjoidGlraS1wZXRzIiwic291cmNlX2V4dGVybmFsX2lkIjoidGlraS1wZXRzOnRpa2kgY2F0IGNoaWNrZW4gcHVtcGtpbiByZWNpcGUgaW4gYnJvdGggYWxvaGEtZnJpZW5kcyBjaGlja2VuLXB1bXBraW4tcmVjaXBlLWluLWJyb3RoIiwic291cmNlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3Byb2R1Y3QvdGlraS1jYXQvdGlraS1jYXQtd2V0LWZvb2Qvc2hyZWRkZWQtY2F0L2Fsb2hhLWZyaWVuZHMvY2hpY2tlbi1wdW1wa2luLXJlY2lwZS1pbi1icm90aC8iLCJzb3VyY2VfYXV0aG9yaXR5IjoibWFudWZhY3R1cmVyIiwiZ3RpbiI6IiIsInBhY2thZ2Vfc2l6ZSI6IiIsImluZ3JlZGllbnRfdGV4dCI6IkNoaWNrZW4sIGNoaWNrZW4gYnJvdGgsIHB1bXBraW4sIGRpY2FsY2l1bSBwaG9zcGhhdGUsIHhhbnRoYW4gZ3VtLCBwb3Rhc3NpdW0gY2hsb3JpZGUsIGNob2xpbmUgY2hsb3JpZGUsIHNhbHQsIG1hZ25lc2l1bSBzdWxmYXRlLCB0YXVyaW5lLCB6aW5jIHN1bGZhdGUsIG5pYWNpbiAodml0YW1pbiBCMyksIHZpdGFtaW4gRSBzdXBwbGVtZW50LCBmZXJyb3VzIHN1bGZhdGUsIG1hbmdhbmVzZSBzdWxmYXRlLCB0aGlhbWluZSBtb25vbml0cmF0ZSAodml0YW1pbiBCMSksIHZpdGFtaW4gQSBzdXBwbGVtZW50LCBjYWxjaXVtIHBhbnRvdGhlbmF0ZSwgc29kaXVtIHNlbGVuaXRlLCBjb3BwZXIgYW1pbm8gYWNpZCBjb21wbGV4LCBweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpLCByaWJvZmxhdmluIHN1cHBsZW1lbnQgKHZpdGFtaW4gQjIpLCBmb2xpYyBhY2lkLCB2aXRhbWluIEQzIHN1cHBsZW1lbnQsIGJpb3Rpbiwgdml0YW1pbiBCMTIgc3VwcGxlbWVudC4iLCJpbmdyZWRpZW50cyI6WyJDaGlja2VuIiwiY2hpY2tlbiBicm90aCIsInB1bXBraW4iLCJkaWNhbGNpdW0gcGhvc3BoYXRlIiwieGFudGhhbiBndW0iLCJwb3Rhc3NpdW0gY2hsb3JpZGUiLCJjaG9saW5lIGNobG9yaWRlIiwic2FsdCIsIm1hZ25lc2l1bSBzdWxmYXRlIiwidGF1cmluZSIsInppbmMgc3VsZmF0ZSIsIm5pYWNpbiAodml0YW1pbiBCMykiLCJ2aXRhbWluIEUgc3VwcGxlbWVudCIsImZlcnJvdXMgc3VsZmF0ZSIsIm1hbmdhbmVzZSBzdWxmYXRlIiwidGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpIiwidml0YW1pbiBBIHN1cHBsZW1lbnQiLCJjYWxjaXVtIHBhbnRvdGhlbmF0ZSIsInNvZGl1bSBzZWxlbml0ZSIsImNvcHBlciBhbWlubyBhY2lkIGNvbXBsZXgiLCJweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpIiwicmlib2ZsYXZpbiBzdXBwbGVtZW50ICh2aXRhbWluIEIyKSIsImZvbGljIGFjaWQiLCJ2aXRhbWluIEQzIHN1cHBsZW1lbnQiLCJiaW90aW4iLCJ2aXRhbWluIEIxMiBzdXBwbGVtZW50Il0sImZyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3dwLWNvbnRlbnQvdXBsb2Fkcy8yMDE4LzA2L2ZyaWVuZHNfY2hpY2tlbl9wdW1wa2luZnJvbnQucG5nIiwiaXNfY29tcGxldGVfZm9vZCI6dHJ1ZSwiYXZhaWxhYmxlX2luX3VzIjp0cnVlLCJwcm90ZWN0ZWRfdGVybXMiOlsiVGlraSBDYXQiLCJBbG9oYSBGcmllbmRzIiwiQ2hpY2tlbiIsIlB1bXBraW4iLCJSZWNpcGUgaW4gQnJvdGgiLCJjYXQiLCJ3ZXQiXSwib2JzZXJ2ZWRfYXQiOiIyMDI2LTA4LTA0VDA4OjIwOjA1WiIsImNvbnRlbnRfaGFzaCI6ImVhM2RiMWQwMTI3ZTU3YjQ5NjlkYWM1OTliM2NiMzJlOTZmODI2YTU5YTQzZDBlMWViZTQwZmI2NGRmYzM3MTciLCJ2YWxpZGF0aW9uX3N0YXR1cyI6ImFjY2VwdGVkIiwidmFsaWRhdGlvbl9yZWFzb25zIjpbXSwiaW5ncmVkaWVudF92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiaW1hZ2VfdmVyaWZpY2F0aW9uX3N0YXR1cyI6Im1hbnVmYWN0dXJlciIsImNvdmVyYWdlX3RpZXIiOiJ0aWVyXzFfdXNfcmV0YWlsIiwiZm9ybXVsYV9ldmlkZW5jZV90aWVyIjoibWFudWZhY3R1cmVyX2N1cnJlbnRfZXhhY3QiLCJmb3JtdWxhX3ZlcnNpb25fcHJvdmVuYW5jZSI6eyJ2ZXJzaW9uX3N0YXR1cyI6Im1hbnVmYWN0dXJlcl9jdXJyZW50Iiwic291cmNlIjoidGlraS1wZXRzIiwic291cmNlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3Byb2R1Y3QvdGlraS1jYXQvdGlraS1jYXQtd2V0LWZvb2Qvc2hyZWRkZWQtY2F0L2Fsb2hhLWZyaWVuZHMvY2hpY2tlbi1wdW1wa2luLXJlY2lwZS1pbi1icm90aC8iLCJjYXB0dXJlZF9hdCI6IjIwMjYtMDgtMDRUMDg6MjA6MDVaIiwiaW5ncmVkaWVudF90ZXh0X2hhc2giOiJjNDVmOWEwZGVmNzYxYzczYTY3ZTAzZDNmOGNhZTlmMDVjOTFhY2RlNGEyNDM1NzU5OGY5NDU3YTA0NGM0OTJlIiwiZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vd3AtY29udGVudC91cGxvYWRzLzIwMTgvMDYvZnJpZW5kc19jaGlja2VuX3B1bXBraW5mcm9udC5wbmciLCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlfSwicmF3X3BheWxvYWQiOnsiY2FjaGVfa2V5IjoidGlraS1wZXRzOnRpa2kgY2F0IGNoaWNrZW4gcHVtcGtpbiByZWNpcGUgaW4gYnJvdGggYWxvaGEtZnJpZW5kcyBjaGlja2VuLXB1bXBraW4tcmVjaXBlLWluLWJyb3RoIiwiaW5ncmVkaWVudF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vcHJvZHVjdC90aWtpLWNhdC90aWtpLWNhdC13ZXQtZm9vZC9zaHJlZGRlZC1jYXQvYWxvaGEtZnJpZW5kcy9jaGlja2VuLXB1bXBraW4tcmVjaXBlLWluLWJyb3RoLyIsImltYWdlX3NvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9hbG9oYS1mcmllbmRzL2NoaWNrZW4tcHVtcGtpbi1yZWNpcGUtaW4tYnJvdGgvIiwiY2Fub25pY2FsX2Zvcm11bGFfaWRlbnRpdHkiOnsibWFudWZhY3R1cmVyIjoid2hpdGVicmlkZ2UgcGV0IGJyYW5kcyIsImJyYW5kIjoidGlraSBjYXQiLCJwcm9kdWN0X2xpbmUiOiJhbG9oYSBmcmllbmRzIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoidW5rbm93biIsImZvb2RfZm9ybSI6IndldCIsImZsYXZvciI6ImNoaWNrZW4gcHVtcGtpbiByZWNpcGUgaW4gYnJvdGgiLCJkaWV0X2NvbmRpdGlvbiI6IiJ9LCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlLCJwYWNrYWdlX3NpemVfaXNfc2t1X29ubHkiOnRydWUsImN1cnJlbnRfb2ZmaWNpYWxfcGFnZV9yZWZyZXNoIjp0cnVlfX0seyJmb3JtdWxhX2tleSI6IndoaXRlYnJpZGdlIHBldCBicmFuZHN8dGlraSBjYXR8YWxvaGEgZnJpZW5kc3xjYXR8dW5rbm93bnx3ZXR8Y2hpY2tlbiBwdW1wa2luIHR1bmEgcmVjaXBlIGluIGJyb3RofCIsImlkZW50aXR5X2hhc2giOiI3YWNiMGM3YjZlZWI4MThmYzc0MmQ1ODU0M2M2ZDFhYjc2N2Q3YTY0NzE2NzA2YjM1MDhhYmM5Mjk2MTk3ODE0IiwibWFudWZhY3R1cmVyIjoiV2hpdGVicmlkZ2UgUGV0IEJyYW5kcyIsImJyYW5kIjoiVGlraSBDYXQiLCJwcm9kdWN0X25hbWUiOiJDaGlja2VuLCBQdW1wa2luICYgVHVuYSBSZWNpcGUgaW4gQnJvdGgiLCJwcm9kdWN0X2xpbmUiOiJBbG9oYSBGcmllbmRzIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoidW5rbm93biIsImZvb2RfZm9ybSI6IndldCIsImZsYXZvciI6IkNoaWNrZW4sIFB1bXBraW4gJiBUdW5hIFJlY2lwZSBpbiBCcm90aCIsImRpZXRfY29uZGl0aW9uIjoiIiwic291cmNlX3NsdWciOiJ0aWtpLXBldHMiLCJzb3VyY2VfZXh0ZXJuYWxfaWQiOiJ0aWtpLXBldHM6dGlraSBjYXQgY2hpY2tlbiBwdW1wa2luIHR1bmEgcmVjaXBlIGluIGJyb3RoIGFsb2hhLWZyaWVuZHMgY2hpY2tlbi1wdW1wa2luLXR1bmEtcmVjaXBlLWluLWJyb3RoIiwic291cmNlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3Byb2R1Y3QvdGlraS1jYXQvdGlraS1jYXQtd2V0LWZvb2Qvc2hyZWRkZWQtY2F0L2Fsb2hhLWZyaWVuZHMvY2hpY2tlbi1wdW1wa2luLXR1bmEtcmVjaXBlLWluLWJyb3RoLyIsInNvdXJjZV9hdXRob3JpdHkiOiJtYW51ZmFjdHVyZXIiLCJndGluIjoiIiwicGFja2FnZV9zaXplIjoiIiwiaW5ncmVkaWVudF90ZXh0IjoiQ2hpY2tlbiwgY2hpY2tlbiBicm90aCwgcHVtcGtpbiwgdHVuYSwgZGljYWxjaXVtIHBob3NwaGF0ZSwgeGFudGhhbiBndW0sIHBvdGFzc2l1bSBjaGxvcmlkZSwgY2hvbGluZSBjaGxvcmlkZSwgc2FsdCwgbWFnbmVzaXVtIHN1bGZhdGUsIHRhdXJpbmUsIHppbmMgc3VsZmF0ZSwgbmlhY2luICh2aXRhbWluIEIzKSwgdml0YW1pbiBFIHN1cHBsZW1lbnQsIGZlcnJvdXMgc3VsZmF0ZSwgbWFuZ2FuZXNlIHN1bGZhdGUsIHRoaWFtaW5lIG1vbm9uaXRyYXRlICh2aXRhbWluIEIxKSwgdml0YW1pbiBBIHN1cHBsZW1lbnQsIGNhbGNpdW0gcGFudG90aGVuYXRlLCBzb2RpdW0gc2VsZW5pdGUsIGNvcHBlciBhbWlubyBhY2lkIGNvbXBsZXgsIHB5cmlkb3hpbmUgaHlkcm9jaGxvcmlkZSAodml0YW1pbiBCNiksIHJpYm9mbGF2aW4gc3VwcGxlbWVudCAodml0YW1pbiBCMiksIGZvbGljIGFjaWQsIHZpdGFtaW4gRDMgc3VwcGxlbWVudCwgYmlvdGluLCB2aXRhbWluIEIxMiBzdXBwbGVtZW50LiIsImluZ3JlZGllbnRzIjpbIkNoaWNrZW4iLCJjaGlja2VuIGJyb3RoIiwicHVtcGtpbiIsInR1bmEiLCJkaWNhbGNpdW0gcGhvc3BoYXRlIiwieGFudGhhbiBndW0iLCJwb3Rhc3NpdW0gY2hsb3JpZGUiLCJjaG9saW5lIGNobG9yaWRlIiwic2FsdCIsIm1hZ25lc2l1bSBzdWxmYXRlIiwidGF1cmluZSIsInppbmMgc3VsZmF0ZSIsIm5pYWNpbiAodml0YW1pbiBCMykiLCJ2aXRhbWluIEUgc3VwcGxlbWVudCIsImZlcnJvdXMgc3VsZmF0ZSIsIm1hbmdhbmVzZSBzdWxmYXRlIiwidGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpIiwidml0YW1pbiBBIHN1cHBsZW1lbnQiLCJjYWxjaXVtIHBhbnRvdGhlbmF0ZSIsInNvZGl1bSBzZWxlbml0ZSIsImNvcHBlciBhbWlubyBhY2lkIGNvbXBsZXgiLCJweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpIiwicmlib2ZsYXZpbiBzdXBwbGVtZW50ICh2aXRhbWluIEIyKSIsImZvbGljIGFjaWQiLCJ2aXRhbWluIEQzIHN1cHBsZW1lbnQiLCJiaW90aW4iLCJ2aXRhbWluIEIxMiBzdXBwbGVtZW50Il0sImZyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3dwLWNvbnRlbnQvdXBsb2Fkcy8yMDE4LzA2L2ZyaWVuZHNfY2hpY2tlbl90dW5hZnJvbnQucG5nIiwiaXNfY29tcGxldGVfZm9vZCI6dHJ1ZSwiYXZhaWxhYmxlX2luX3VzIjp0cnVlLCJwcm90ZWN0ZWRfdGVybXMiOlsiVGlraSBDYXQiLCJBbG9oYSBGcmllbmRzIiwiQ2hpY2tlbiIsIlB1bXBraW4iLCJUdW5hIiwiUmVjaXBlIGluIEJyb3RoIiwiY2F0Iiwid2V0Il0sIm9ic2VydmVkX2F0IjoiMjAyNi0wOC0wNFQwODoyMDowNVoiLCJjb250ZW50X2hhc2giOiJmNTc3YjdlNjNiZDc5ODhiMzVhNmMzNDUwMWEyZjAxYjUxMGU0NmVkZWM5NWNmZTU5NTJiMzc0ZDhhNWFkNjJmIiwidmFsaWRhdGlvbl9zdGF0dXMiOiJhY2NlcHRlZCIsInZhbGlkYXRpb25fcmVhc29ucyI6W10sImluZ3JlZGllbnRfdmVyaWZpY2F0aW9uX3N0YXR1cyI6Im1hbnVmYWN0dXJlciIsImltYWdlX3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJtYW51ZmFjdHVyZXIiLCJjb3ZlcmFnZV90aWVyIjoidGllcl8xX3VzX3JldGFpbCIsImZvcm11bGFfZXZpZGVuY2VfdGllciI6Im1hbnVmYWN0dXJlcl9jdXJyZW50X2V4YWN0IiwiZm9ybXVsYV92ZXJzaW9uX3Byb3ZlbmFuY2UiOnsidmVyc2lvbl9zdGF0dXMiOiJtYW51ZmFjdHVyZXJfY3VycmVudCIsInNvdXJjZSI6InRpa2ktcGV0cyIsInNvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9hbG9oYS1mcmllbmRzL2NoaWNrZW4tcHVtcGtpbi10dW5hLXJlY2lwZS1pbi1icm90aC8iLCJjYXB0dXJlZF9hdCI6IjIwMjYtMDgtMDRUMDg6MjA6MDVaIiwiaW5ncmVkaWVudF90ZXh0X2hhc2giOiJkNjNiYzk1Y2VmNGZhOWVmOTFiN2EwYzUwYzVlMDgwZWE2NDAzMTJlNjk5ZDc4MzU0NjVhMzc4OTE2NmQxY2JhIiwiZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vd3AtY29udGVudC91cGxvYWRzLzIwMTgvMDYvZnJpZW5kc19jaGlja2VuX3R1bmFmcm9udC5wbmciLCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlfSwicmF3X3BheWxvYWQiOnsiY2FjaGVfa2V5IjoidGlraS1wZXRzOnRpa2kgY2F0IGNoaWNrZW4gcHVtcGtpbiB0dW5hIHJlY2lwZSBpbiBicm90aCBhbG9oYS1mcmllbmRzIGNoaWNrZW4tcHVtcGtpbi10dW5hLXJlY2lwZS1pbi1icm90aCIsImluZ3JlZGllbnRfc291cmNlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3Byb2R1Y3QvdGlraS1jYXQvdGlraS1jYXQtd2V0LWZvb2Qvc2hyZWRkZWQtY2F0L2Fsb2hhLWZyaWVuZHMvY2hpY2tlbi1wdW1wa2luLXR1bmEtcmVjaXBlLWluLWJyb3RoLyIsImltYWdlX3NvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9hbG9oYS1mcmllbmRzL2NoaWNrZW4tcHVtcGtpbi10dW5hLXJlY2lwZS1pbi1icm90aC8iLCJjYW5vbmljYWxfZm9ybXVsYV9pZGVudGl0eSI6eyJtYW51ZmFjdHVyZXIiOiJ3aGl0ZWJyaWRnZSBwZXQgYnJhbmRzIiwiYnJhbmQiOiJ0aWtpIGNhdCIsInByb2R1Y3RfbGluZSI6ImFsb2hhIGZyaWVuZHMiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJ1bmtub3duIiwiZm9vZF9mb3JtIjoid2V0IiwiZmxhdm9yIjoiY2hpY2tlbiBwdW1wa2luIHR1bmEgcmVjaXBlIGluIGJyb3RoIiwiZGlldF9jb25kaXRpb24iOiIifSwiZXhhY3RfZm9ybXVsYV9ldmlkZW5jZSI6dHJ1ZSwicGFja2FnZV9zaXplX2lzX3NrdV9vbmx5Ijp0cnVlLCJjdXJyZW50X29mZmljaWFsX3BhZ2VfcmVmcmVzaCI6dHJ1ZX19LHsiZm9ybXVsYV9rZXkiOiJ3aGl0ZWJyaWRnZSBwZXQgYnJhbmRzfHRpa2kgY2F0fGFsb2hhIGZyaWVuZHN8Y2F0fHVua25vd258d2V0fHR1bmEgcHVtcGtpbiByZWNpcGUgaW4gYnJvdGh8IiwiaWRlbnRpdHlfaGFzaCI6IjAzNzM0ODY3ODlkY2I1M2MyZDUxNjdkMjBlODJjNTZkN2Q1YmQwNjkyOGM1MTc4ODVkYTRkMzVkMTFjM2I1NjUiLCJtYW51ZmFjdHVyZXIiOiJXaGl0ZWJyaWRnZSBQZXQgQnJhbmRzIiwiYnJhbmQiOiJUaWtpIENhdCIsInByb2R1Y3RfbmFtZSI6IlR1bmEgJiBQdW1wa2luIFJlY2lwZSBpbiBCcm90aCIsInByb2R1Y3RfbGluZSI6IkFsb2hhIEZyaWVuZHMiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJ1bmtub3duIiwiZm9vZF9mb3JtIjoid2V0IiwiZmxhdm9yIjoiVHVuYSAmIFB1bXBraW4gUmVjaXBlIGluIEJyb3RoIiwiZGlldF9jb25kaXRpb24iOiIiLCJzb3VyY2Vfc2x1ZyI6InRpa2ktcGV0cyIsInNvdXJjZV9leHRlcm5hbF9pZCI6InRpa2ktcGV0czp0aWtpIGNhdCB0dW5hIHB1bXBraW4gcmVjaXBlIGluIGJyb3RoIGFsb2hhLWZyaWVuZHMgdHVuYS13aXRoLXB1bXBraW4iLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly90aWtpcGV0cy5jb20vcHJvZHVjdC90aWtpLWNhdC90aWtpLWNhdC13ZXQtZm9vZC9zaHJlZGRlZC1jYXQvYWxvaGEtZnJpZW5kcy90dW5hLXdpdGgtcHVtcGtpbi8iLCJzb3VyY2VfYXV0aG9yaXR5IjoibWFudWZhY3R1cmVyIiwiZ3RpbiI6IiIsInBhY2thZ2Vfc2l6ZSI6IiIsImluZ3JlZGllbnRfdGV4dCI6IlR1bmEgYnJvdGgsIHR1bmEsIHB1bXBraW4sIHN1bmZsb3dlciBzZWVkIG9pbCwgY2FsY2l1bSBsYWN0YXRlLCB4YW50aGFuIGd1bSwgdHJpY2FsY2l1bSBwaG9zcGhhdGUsIGNob2xpbmUgY2hsb3JpZGUsIHRhdXJpbmUsIHppbmMgc3VsZmF0ZSwgdml0YW1pbiBFIHN1cHBsZW1lbnQsIG5pYWNpbiAodml0YW1pbiBCMyksIHRoaWFtaW5lIG1vbm9uaXRyYXRlICh2aXRhbWluIEIxKSwgY2FsY2l1bSBwYW50b3RoZW5hdGUsIG1hbmdhbmVzZSBzdWxmYXRlLCB2aXRhbWluIEEgc3VwcGxlbWVudCwgcHlyaWRveGluZSBoeWRyb2NobG9yaWRlICh2aXRhbWluIEI2KSwgc29kaXVtIHNlbGVuaXRlLCByaWJvZmxhdmluIHN1cHBsZW1lbnQgKHZpdGFtaW4gQjIpLCBmb2xpYyBhY2lkLCBmZXJyb3VzIHN1bGZhdGUsIGNvcHBlciBzdWxmYXRlLCB2aXRhbWluIEQzIHN1cHBsZW1lbnQsIG1lbmFkaW9uZSBzb2RpdW0gYmlzdWxmaXRlIGNvbXBsZXggKHNvdXJjZSBvZiB2aXRhbWluIEsgYWN0aXZpdHkpLCBwb3Rhc3NpdW0gaW9kaWRlLCBiaW90aW4sIHZpdGFtaW4gQjEyIHN1cHBsZW1lbnQuIiwiaW5ncmVkaWVudHMiOlsiVHVuYSBicm90aCIsInR1bmEiLCJwdW1wa2luIiwic3VuZmxvd2VyIHNlZWQgb2lsIiwiY2FsY2l1bSBsYWN0YXRlIiwieGFudGhhbiBndW0iLCJ0cmljYWxjaXVtIHBob3NwaGF0ZSIsImNob2xpbmUgY2hsb3JpZGUiLCJ0YXVyaW5lIiwiemluYyBzdWxmYXRlIiwidml0YW1pbiBFIHN1cHBsZW1lbnQiLCJuaWFjaW4gKHZpdGFtaW4gQjMpIiwidGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpIiwiY2FsY2l1bSBwYW50b3RoZW5hdGUiLCJtYW5nYW5lc2Ugc3VsZmF0ZSIsInZpdGFtaW4gQSBzdXBwbGVtZW50IiwicHlyaWRveGluZSBoeWRyb2NobG9yaWRlICh2aXRhbWluIEI2KSIsInNvZGl1bSBzZWxlbml0ZSIsInJpYm9mbGF2aW4gc3VwcGxlbWVudCAodml0YW1pbiBCMikiLCJmb2xpYyBhY2lkIiwiZmVycm91cyBzdWxmYXRlIiwiY29wcGVyIHN1bGZhdGUiLCJ2aXRhbWluIEQzIHN1cHBsZW1lbnQiLCJtZW5hZGlvbmUgc29kaXVtIGJpc3VsZml0ZSBjb21wbGV4IChzb3VyY2Ugb2Ygdml0YW1pbiBLIGFjdGl2aXR5KSIsInBvdGFzc2l1bSBpb2RpZGUiLCJiaW90aW4iLCJ2aXRhbWluIEIxMiBzdXBwbGVtZW50Il0sImZyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3dwLWNvbnRlbnQvdXBsb2Fkcy8yMDE4LzAxL2ZyaWVuZHNfdHVuYV9wdW1wa2luZnJvbnQucG5nIiwiaXNfY29tcGxldGVfZm9vZCI6dHJ1ZSwiYXZhaWxhYmxlX2luX3VzIjp0cnVlLCJwcm90ZWN0ZWRfdGVybXMiOlsiVGlraSBDYXQiLCJBbG9oYSBGcmllbmRzIiwiVHVuYSIsIlB1bXBraW4iLCJSZWNpcGUgaW4gQnJvdGgiLCJjYXQiLCJ3ZXQiXSwib2JzZXJ2ZWRfYXQiOiIyMDI2LTA4LTA0VDA4OjIwOjA1WiIsImNvbnRlbnRfaGFzaCI6IjBlMjQyYWY1ZmEzMmY0YTkzNDVmMjQ5ZDVjMzIxMmViYjVlY2I2MWE1NDgwMjc3MzM4NTRkODFhZGYxM2E0NDciLCJ2YWxpZGF0aW9uX3N0YXR1cyI6ImFjY2VwdGVkIiwidmFsaWRhdGlvbl9yZWFzb25zIjpbXSwiaW5ncmVkaWVudF92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiaW1hZ2VfdmVyaWZpY2F0aW9uX3N0YXR1cyI6Im1hbnVmYWN0dXJlciIsImNvdmVyYWdlX3RpZXIiOiJ0aWVyXzFfdXNfcmV0YWlsIiwiZm9ybXVsYV9ldmlkZW5jZV90aWVyIjoibWFudWZhY3R1cmVyX2N1cnJlbnRfZXhhY3QiLCJmb3JtdWxhX3ZlcnNpb25fcHJvdmVuYW5jZSI6eyJ2ZXJzaW9uX3N0YXR1cyI6Im1hbnVmYWN0dXJlcl9jdXJyZW50Iiwic291cmNlIjoidGlraS1wZXRzIiwic291cmNlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3Byb2R1Y3QvdGlraS1jYXQvdGlraS1jYXQtd2V0LWZvb2Qvc2hyZWRkZWQtY2F0L2Fsb2hhLWZyaWVuZHMvdHVuYS13aXRoLXB1bXBraW4vIiwiY2FwdHVyZWRfYXQiOiIyMDI2LTA4LTA0VDA4OjIwOjA1WiIsImluZ3JlZGllbnRfdGV4dF9oYXNoIjoiMWUzZWZjNTY1YWRmZWMzM2Y0YTRiMjk0YTQxZWVlNWYyNTBkYzc4YmI3NjEwNzFkNzhkZDA0NGI2M2VjM2NkYyIsImZyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vdGlraXBldHMuY29tL3dwLWNvbnRlbnQvdXBsb2Fkcy8yMDE4LzAxL2ZyaWVuZHNfdHVuYV9wdW1wa2luZnJvbnQucG5nIiwiZXhhY3RfZm9ybXVsYV9ldmlkZW5jZSI6dHJ1ZX0sInJhd19wYXlsb2FkIjp7ImNhY2hlX2tleSI6InRpa2ktcGV0czp0aWtpIGNhdCB0dW5hIHB1bXBraW4gcmVjaXBlIGluIGJyb3RoIGFsb2hhLWZyaWVuZHMgdHVuYS13aXRoLXB1bXBraW4iLCJpbmdyZWRpZW50X3NvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9hbG9oYS1mcmllbmRzL3R1bmEtd2l0aC1wdW1wa2luLyIsImltYWdlX3NvdXJjZV91cmwiOiJodHRwczovL3Rpa2lwZXRzLmNvbS9wcm9kdWN0L3Rpa2ktY2F0L3Rpa2ktY2F0LXdldC1mb29kL3NocmVkZGVkLWNhdC9hbG9oYS1mcmllbmRzL3R1bmEtd2l0aC1wdW1wa2luLyIsImNhbm9uaWNhbF9mb3JtdWxhX2lkZW50aXR5Ijp7Im1hbnVmYWN0dXJlciI6IndoaXRlYnJpZGdlIHBldCBicmFuZHMiLCJicmFuZCI6InRpa2kgY2F0IiwicHJvZHVjdF9saW5lIjoiYWxvaGEgZnJpZW5kcyIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6InVua25vd24iLCJmb29kX2Zvcm0iOiJ3ZXQiLCJmbGF2b3IiOiJ0dW5hIHB1bXBraW4gcmVjaXBlIGluIGJyb3RoIiwiZGlldF9jb25kaXRpb24iOiIifSwiZXhhY3RfZm9ybXVsYV9ldmlkZW5jZSI6dHJ1ZSwicGFja2FnZV9zaXplX2lzX3NrdV9vbmx5Ijp0cnVlLCJjdXJyZW50X29mZmljaWFsX3BhZ2VfcmVmcmVzaCI6dHJ1ZX19XQ==', 'base64'), 'UTF8')::JSONB;
  v_run_id BIGINT;
  v_formula RECORD;
  v_formula_count INTEGER;
  v_chicken_pumpkin_id BIGINT;
  v_retailer_formula_id BIGINT;
  v_retailer_key CONSTANT TEXT :=
    'tiki cat|tiki cat|tiki cat friends cat food pouch non gmo grain and potato free|cat|all life stages|wet|chicken and pumpkin|';
  v_retailer_cache CONSTANT TEXT :=
    'petsmart-retail-catalog:693804480378';
  v_retailer_url CONSTANT TEXT :=
    'https://www.petsmart.com/cat/food-and-treats/canned-food/tiki-cat-friends-and-trade-cat-food-pouch-non-gmo-grain-and-potato-free-2-5-oz-57658.html';
  v_top TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_source_runs
    WHERE run_key =
      'tiki-pets:bounded-exact-evidence:aloha-friends:20260804:v1'
  ) THEN
    RAISE EXCEPTION 'Tiki Aloha Friends exact-evidence run already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE lower(regexp_replace(source_url, '/+$', '')) IN (
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-duck-recipe-in-broth/',
        '/+$', ''
      )),
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-lamb-recipe-in-broth/',
        '/+$', ''
      )),
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-recipe-in-broth/',
        '/+$', ''
      )),
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-tuna-recipe-in-broth/',
        '/+$', ''
      )),
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/tuna-with-pumpkin/',
        '/+$', ''
      ))
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE lower(regexp_replace(COALESCE(source_url, ''), '/+$', '')) IN (
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-duck-recipe-in-broth/',
        '/+$', ''
      )),
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-lamb-recipe-in-broth/',
        '/+$', ''
      )),
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-recipe-in-broth/',
        '/+$', ''
      )),
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-tuna-recipe-in-broth/',
        '/+$', ''
      )),
      lower(regexp_replace(
        'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/tuna-with-pumpkin/',
        '/+$', ''
      ))
    )
  ) THEN
    RAISE EXCEPTION 'A Tiki Aloha Friends official formula already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_retailer_cache
      AND brand = 'Tiki Cat'
      AND pet_type = 'cat'
      AND life_stage = 'all life stages'
      AND food_form = 'wet'
      AND flavor = 'Chicken & Pumpkin'
      AND gtin = '693804480378'
      AND source_url = v_retailer_url
      AND ingredient_count = 26
      AND md5(ingredient_text) = 'f8440dd25d98689208298a0a8c068ae8'
      AND image_url = 'https://s7d2.scene7.com/is/image/PetSmart/5298927'
      AND ingredient_verification_status = 'retailer_verified'
      AND image_verification_status = 'retailer_verified'
      AND formula_evidence_tier = 'retailer_web_version'
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION
      'Tiki Chicken & Pumpkin PetSmart source-version precondition changed';
  END IF;

  PERFORM public.stage_catalog_census_batch(v_run, v_payload);

  SELECT id
  INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key =
      'tiki-pets:bounded-exact-evidence:aloha-friends:20260804:v1'
    AND status = 'completed'
    AND source_slug = 'tiki-pets'
    AND source_type = 'manufacturer'
    AND expected_count = 5
    AND observed_count = 5
    AND accepted_count = 5
    AND rejected_count = 0
    AND pagination_complete
    AND metadata->>'bounded_exact_evidence' = 'true'
    AND metadata->>'exact_formula_evidence' = 'true';

  UPDATE public.catalog_formulas formula
  SET complete_food_evidence =
        'Refreshed exact official Tiki Cat product page with one complete formula, full manufacturer ingredient statement, guaranteed analysis, feeding guidance, and matching front-package image.',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'manufacturer_current',
          'source', 'tiki-pets',
          'source_url', formula.source_url,
          'captured_at', '2026-08-04T08:20:05Z'::TIMESTAMPTZ,
          'ingredient_text_hash',
            encode(digest(formula.ingredient_text, 'sha256'), 'hex'),
          'front_image_url', formula.front_image_url,
          'exact_formula_evidence', TRUE,
          'package_size_is_sku_only', TRUE
        ),
      verification_status = 'verified',
      active = TRUE,
      is_popular_brand = TRUE,
      updated_at = NOW()
  WHERE formula.id IN (
    SELECT observation.formula_id
    FROM public.catalog_observations observation
    WHERE observation.run_id = v_run_id
      AND observation.validation_status = 'accepted'
  );

  UPDATE public.catalog_observations observation
  SET formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = formula.formula_version_provenance
  FROM public.catalog_formulas formula
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = formula.id;

  SELECT count(DISTINCT formula.id)::INTEGER
  INTO v_formula_count
  FROM public.catalog_observations observation
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE observation.run_id = v_run_id
    AND observation.validation_status = 'accepted'
    AND formula.manufacturer = 'Whitebridge Pet Brands'
    AND formula.brand = 'Tiki Cat'
    AND formula.product_line = 'Aloha Friends'
    AND formula.pet_type = 'cat'
    AND formula.life_stage = 'unknown'
    AND formula.food_form = 'wet'
    AND formula.flavor IN (
      'Chicken, Pumpkin & Duck Recipe in Broth',
      'Chicken, Pumpkin & Lamb Recipe in Broth',
      'Chicken & Pumpkin Recipe in Broth',
      'Chicken, Pumpkin & Tuna Recipe in Broth',
      'Tuna & Pumpkin Recipe in Broth'
    )
    AND formula.verification_status = 'verified'
    AND formula.active
    AND formula.formula_evidence_tier = 'manufacturer_current_exact'
    AND cardinality(formula.ingredients) BETWEEN 26 AND 27
    AND formula.ingredient_verification_status = 'manufacturer'
    AND formula.image_verification_status = 'manufacturer'
    AND formula.source_url LIKE
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/%'
    AND formula.front_image_url LIKE
      'https://tikipets.com/wp-content/uploads/%';

  IF v_formula_count <> 5 THEN
    RAISE EXCEPTION
      'Tiki Aloha Friends expected five exact formulas, found %',
      v_formula_count;
  END IF;

  SELECT id
  INTO STRICT v_chicken_pumpkin_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'whitebridge pet brands|tiki cat|aloha friends|cat|unknown|wet|chicken pumpkin recipe in broth|'
    AND source_url =
      'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/aloha-friends/chicken-pumpkin-recipe-in-broth/'
    AND md5(ingredient_text) = 'f8440dd25d98689208298a0a8c068ae8'
    AND front_image_url =
      'https://tikipets.com/wp-content/uploads/2018/06/friends_chicken_pumpkinfront.png';

  SELECT id
  INTO STRICT v_retailer_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_retailer_key
    AND active
    AND verification_status = 'verified'
    AND formula_evidence_tier = 'retailer_web_version'
    AND source_url = v_retailer_url
    AND cardinality(ingredients) = 26
    AND public.catalog_normalize_ingredient_evidence(ingredient_text) =
        public.catalog_normalize_ingredient_evidence(
          (
            SELECT ingredient_text
            FROM public.catalog_formulas
            WHERE id = v_chicken_pumpkin_id
          )
        );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key = v_retailer_key
      AND formula_id <> v_chicken_pumpkin_id
  ) THEN
    RAISE EXCEPTION
      'Tiki Chicken & Pumpkin retailer alias belongs to another formula';
  END IF;

  UPDATE public.catalog_observations
  SET formula_id = v_chicken_pumpkin_id
  WHERE formula_id = v_retailer_formula_id;

  UPDATE public.catalog_field_evidence
  SET formula_id = v_chicken_pumpkin_id
  WHERE formula_id = v_retailer_formula_id;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,
    formula_id,
    identity_hash,
    match_reason,
    source_url,
    metadata,
    updated_at
  )
  SELECT
    v_retailer_key,
    v_chicken_pumpkin_id,
    canonical.identity_hash,
    'manual_review',
    v_retailer_url,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'official_source_url', canonical.source_url,
      'retailer', 'PetSmart',
      'retailer_gtin', '693804480378',
      'retailer_cache_key', v_retailer_cache,
      'ingredient_statement_match', TRUE,
      'ingredient_count', 26,
      'ingredient_text_hash',
        encode(digest(canonical.ingredient_text, 'sha256'), 'hex'),
      'species_boundary', 'cat',
      'food_form_boundary', 'wet',
      'recipe_boundary', 'chicken and pumpkin',
      'package_size_is_sku_only', TRUE,
      'retailer_source_version_retained', TRUE,
      'reviewed_at', NOW()
    ),
    NOW()
  FROM public.catalog_formulas canonical
  WHERE canonical.id = v_chicken_pumpkin_id
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = EXCLUDED.formula_id,
      identity_hash = EXCLUDED.identity_hash,
      match_reason = EXCLUDED.match_reason,
      source_url = EXCLUDED.source_url,
      metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
      updated_at = NOW();

  UPDATE public.catalog_formulas
  SET verification_status = 'quarantined',
      active = FALSE,
      absent_since = COALESCE(absent_since, NOW()),
      promoted_cache_key = NULL,
      promoted_at = NULL,
      complete_food_evidence =
        'Reconciled exact PetSmart Chicken & Pumpkin package alias of the current Tiki Cat Aloha Friends manufacturer formula.',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'duplicate_of_formula_id', v_chicken_pumpkin_id,
          'same_ingredient_statement', TRUE,
          'retailer_source_version_retained', TRUE,
          'reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE id = v_retailer_formula_id;

  FOR v_formula IN
    SELECT formula.id, formula.product_name
    FROM public.catalog_observations observation
    JOIN public.catalog_formulas formula
      ON formula.id = observation.formula_id
    WHERE observation.run_id = v_run_id
      AND observation.validation_status = 'accepted'
    ORDER BY formula.id
  LOOP
    PERFORM *
    FROM public.promote_catalog_formula_without_exact_evidence_reuse(
      v_formula.id
    );
  END LOOP;

  -- Attach the exact retailer GTIN only after the manufacturer serving row
  -- is promoted. This keeps the serving row from inheriting a package code
  -- that was not published on the official page, while barcode lookup still
  -- reaches the canonical formula through its SKU child.
  UPDATE public.catalog_skus
  SET formula_id = v_chicken_pumpkin_id,
      updated_at = NOW()
  WHERE formula_id = v_retailer_formula_id;

  FOR v_formula IN
    SELECT formula.id,
           formula.promoted_cache_key,
           formula.product_name,
           formula.source_url,
           formula.flavor
    FROM public.catalog_observations observation
    JOIN public.catalog_formulas formula
      ON formula.id = observation.formula_id
    WHERE observation.run_id = v_run_id
      AND observation.validation_status = 'accepted'
    ORDER BY formula.id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.catalog_verified_product_search_aliases search_alias
      WHERE search_alias.active
        AND search_alias.normalized_alias =
          public.normalize_verified_product_search_query(
            'Tiki Cat Aloha Friends ' || v_formula.product_name
          )
        AND search_alias.cache_key <> v_formula.promoted_cache_key
    ) THEN
      RAISE EXCEPTION
        'Tiki Aloha Friends search alias belongs to another product: %',
        v_formula.product_name;
    END IF;

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
      v_formula.promoted_cache_key,
      'Tiki Cat Aloha Friends ' || v_formula.product_name,
      public.normalize_verified_product_search_query(
        'Tiki Cat Aloha Friends ' || v_formula.product_name
      ),
      v_formula.source_url,
      'manufacturer',
      '2026-08-04T08:20:05Z'::TIMESTAMPTZ,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'manufacturer_current', TRUE,
        'formula_id', v_formula.id,
        'product_line', 'Aloha Friends',
        'species_boundary', 'cat',
        'food_form_boundary', 'wet',
        'recipe_boundary', v_formula.flavor,
        'captured_at', '2026-08-04T08:20:05Z'::TIMESTAMPTZ
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
        provenance = EXCLUDED.provenance,
        updated_at = NOW();

    SELECT cache_key
    INTO v_top
    FROM public.search_verified_products(
      'Tiki Cat Aloha Friends ' || v_formula.product_name,
      1
    );

    IF v_top IS DISTINCT FROM v_formula.promoted_cache_key THEN
      RAISE EXCEPTION
        'Tiki Aloha Friends exact search is not rank one: % / %',
        v_formula.product_name,
        v_top;
    END IF;
  END LOOP;

  IF (
    SELECT count(DISTINCT formula.id)
    FROM public.catalog_observations observation
    JOIN public.catalog_formulas formula
      ON formula.id = observation.formula_id
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE observation.run_id = v_run_id
      AND observation.validation_status = 'accepted'
      AND formula.verification_status = 'verified'
      AND formula.active
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.source_url = formula.source_url
      AND serving.product_name = formula.product_name
      AND serving.product_line = formula.product_line
      AND serving.flavor = formula.flavor
      AND serving.pet_type = 'cat'
      AND COALESCE(serving.life_stage, 'unknown') = 'unknown'
      AND serving.food_form = 'wet'
      AND serving.ingredient_count = cardinality(formula.ingredients)
      AND public.catalog_normalize_ingredient_evidence(
            serving.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          )
      AND serving.image_url = formula.front_image_url
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.is_complete_food
      AND serving.catalog_exclusion_reason IS NULL
  ) <> 5 THEN
    RAISE EXCEPTION
      'Tiki Aloha Friends exact serving-row postconditions failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key = v_retailer_key
      AND formula_id = v_chicken_pumpkin_id
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_retailer_formula_id
      AND (active OR verification_status <> 'quarantined')
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_retailer_cache
      AND gtin = '693804480378'
      AND md5(ingredient_text) = 'f8440dd25d98689208298a0a8c068ae8'
      AND formula_evidence_tier = 'retailer_web_version'
  ) THEN
    RAISE EXCEPTION
      'Tiki Chicken & Pumpkin canonical/retailer-version reconciliation failed';
  END IF;
END;
$migration$;
