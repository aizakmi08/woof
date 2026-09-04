-- Deterministic retailer identity aliases, wave iams_public_front_ocr_a.
-- Generated from inputs/catalog-reviewed-iams-public-front-ocr-aliases-20260809.json after exact official/live evidence validation.
-- Retailer rows remain identity-only; this migration never copies retailer
-- ingredients or images into product_data and never changes scoring.

DO $migration$
DECLARE
  v_payload JSONB := convert_from(
    decode('W3siYWxpYXNfZm9ybXVsYV9rZXkiOiJpYW1zfGlhbXN8aWFtcyBwcm9hY3RpdmUgaGVhbHRoIGhpZ2ggcHJvdGVpbiBjaGlja2VuIGFuZCBiZWVmIGRyeSBkb2cgZm9vZHxkb2d8dW5rbm93bnxkcnl8fCIsInNvdXJjZV91cmwiOiJodHRwczovL3d3dy5jaGV3eS5jb20vaWFtcy1wcm9hY3RpdmUtaGVhbHRoLWhpZ2gtcHJvdGVpbi9kcC8zNzU4MDk0Iiwib2ZmaWNpYWxfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LmlhbXMuY29tL3Byb2R1Y3RzL2RyeS9pYW1zLXByb2FjdGl2ZS1oZWFsdGgtaGlnaC1wcm90ZWluLWNoaWNrZW4tYW5kLWJlZWYtZHJ5LWRvZy1mb29kIiwiY2FjaGVfa2V5IjoiaWFtczowMTkwMTQ4MzAzNjciLCJ0YXJnZXRfZm9ybXVsYV9rZXkiOiJpYW1zfGlhbXN8aWFtcyBwcm9hY3RpdmUgaGVhbHRoIGhpZ2ggcHJvdGVpbiBjaGlja2VuIGFuZCBiZWVmIGRyeSBkb2cgZm9vZHxkb2d8YWR1bHR8ZHJ5fGNoaWNrZW4gYW5kIGJlZWZ8IiwicmV2aWV3ZWRfYXQiOiIyMDI2LTA4LTEwVDA0OjIwOjAwLjAwMFoiLCJyZXZpZXdfbWV0aG9kIjoicHVibGljX3JldGFpbGVyX2Zyb250X29jcl90b19vZmZpY2lhbF9zdHJ1Y3R1cmVkX2lkZW50aXR5X21hbnVhbF9yZXZpZXciLCJyZXZpZXdfcmVhc29uIjoiTWFudWFsIHJldmlldyBvZiB0aGUgcHVibGljIHJldGFpbGVyIHBhY2thZ2UgZnJvbnQgY29uZmlybXMgdGhlIHNhbWUgSUFNUyBsaW5lLCBzcGVjaWVzLCBmb29kIGZvcm0sIGxpZmUgc3RhZ2UsIHJlY2lwZSwgcHJlc2VudGF0aW9uLCBhbmQgY29uZGl0aW9uIGFzIG9uZSBtYW51ZmFjdHVyZXItY3VycmVudCBmb3JtdWxhLiBGcm9udC1sYWJlbCBPQ1IgaXMgaWRlbnRpdHkgZXZpZGVuY2Ugb25seTsgaW5ncmVkaWVudHMgYW5kIHRoZSBzZXJ2aW5nIGltYWdlIHJlbWFpbiBib3VuZCB0byB0aGUgbWFudWZhY3R1cmVyIHJvdy4iLCJyZXRhaWxlcl9pZGVudGl0eV9vbmx5Ijp0cnVlLCJyZXRhaWxlcl9pbmdyZWRpZW50X3ZlcmlmaWNhdGlvbiI6ZmFsc2UsInJldGFpbGVyX3NvdXJjZV9zbHVnIjoiY2hld3ktcHVibGljLXNpdGVtYXAiLCJyZXRhaWxlcl9wcm9kdWN0X2lkIjoiMzc1ODA5NCIsInJldGFpbGVyX3RpdGxlIjoiSWFtcyBQcm9hY3RpdmUgSGVhbHRoIEhpZ2ggUHJvdGVpbiBDaGlja2VuICYgQmVlZiBEcnkgRG9nIEZvb2QiLCJyZXRhaWxlcl9vYnNlcnZlZF9hdCI6IjIwMjYtMDgtMDVUMjA6NTU6MzAuNDU1WiIsInJldGFpbGVyX2NvbnRlbnRfaGFzaCI6ImE0YTExZjE0YTNmMjk0ZGM0MTBmNTVhNGFjMDc4NmJmZWRlNWU2NTMyMzQ3MmE0YWQzODY0NThmY2E1YWUwZDEiLCJyZXRhaWxlcl9mcm9udF9pbWFnZV91cmwiOiJodHRwczovL2ltYWdlLmNoZXd5LmNvbS9jYXRhbG9nL2dlbmVyYWwvaW1hZ2VzL21vZS8wNjlkODIwYy04OWQxLTdmYTAtODAwMC00MzdmNjA0ZDU3MjAuX1YxXy5qcGciLCJyZXRhaWxlcl9mcm9udF9pbWFnZV9zaGEyNTYiOiIzYzQwYmQwM2I1NjU3M2E5M2Y4ZDA5YzI2YmI4YzU1ZDAyYzNiNjU3Y2ZiMWFmOWY0YWRiYTZiYTY4NWI0MTdkIiwicmV0YWlsZXJfZnJvbnRfbGFiZWxfb2NyIjoiRUlJTkFSLyDigKLigKIgVE0gSUFNU+KAojogUFJPQUNUSVZFIEhFQUxUSCxcIiBISUdIIFBST1RFSU4gT0YgUFJPVEVJTiBGUk9NIEFOSU1BTCBTT1VSQ0VTdCBXSVRIIENISUNLRU4gJiBCRUVGIEhFTFBTIFNVUFBPUlQgU1RST05HIE1VU0NMRVMgV0lUSCBISUdIIFFVQUxJVFkgUFJPVEVJTiBTVVBQT1JUUyBIRUFMVEhZSk9JTlRTIFdJVEggR0xVQ09TQU1JTkUgJiBDSE9ORFJPSVRJTiAjMSBJTkdSRURJRU5UIElTIFJFQUwgQ0hJQ0tFTiB0QVBQUk9YSU1BVEUgJiBERVJJVkVEIEZST00gVU5QUk9DRVNTRUQgU1RBVEUgT0YgSU5HUkVESUVOVFMgMzBMQiBBRFVMVDErIiwibWFudWFsX3BhY2thZ2VfaW1hZ2VfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF9vY3JfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF92aXN1YWxfbWF0Y2giOnRydWUsInJlcXVpcmVkX29jcl90ZXJtcyI6WyJwcm9hY3RpdmUgaGVhbHRoIiwiaGlnaCBwcm90ZWluIiwiYW5pbWFsIHNvdXJjZXMiLCJjaGlja2VuIiwiYmVlZiIsIjMwbGIiLCJhZHVsdDEiXSwicHJvdGVjdGVkX2lkZW50aXR5X3Rlcm1zIjpbImlhbXMgcHJvYWN0aXZlIGhlYWx0aCIsImhpZ2ggcHJvdGVpbiIsIjgwJSBvZiBwcm90ZWluIGZyb20gYW5pbWFsIHNvdXJjZXMiLCJ3aXRoIGNoaWNrZW4gYW5kIGJlZWYiLCIzMCBsYiIsImFkdWx0IDErIl0sIm9ic2VydmVkX2lkZW50aXR5Ijp7ImJyYW5kIjoiaWFtcyIsInBldF90eXBlIjoiZG9nIiwibGlmZV9zdGFnZSI6InVua25vd24iLCJmb29kX2Zvcm0iOiJkcnkifSwidGFyZ2V0X2lkZW50aXR5Ijp7ImJyYW5kIjoiSUFNUyIsInByb2R1Y3RfbmFtZSI6IklBTVMgUHJvYWN0aXZlIEhlYWx0aCBIaWdoIFByb3RlaW4gQ2hpY2tlbiBhbmQgQmVlZiBEcnkgRG9nIEZvb2QiLCJwcm9kdWN0X2xpbmUiOiJQcm9hY3RpdmUgSGVhbHRo4oSiIEhpZ2ggUHJvdGVpbiIsImZsYXZvciI6IkNoaWNrZW4gYW5kIEJlZWYiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJhZHVsdCIsImZvb2RfZm9ybSI6ImRyeSIsInBhY2thZ2Vfc2l6ZSI6IjUsIDE1LCAzMCwgMzguNSJ9LCJvZmZpY2lhbF9kYXRhYmFzZV9pbWFnZV91cmwiOiJodHRwczovL3d3dy5pYW1zLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjkzOTEvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy91a3FtaXN1d3VvemVlenZyaDVmZS5wbmciLCJvZmZpY2lhbF9pbWFnZV91cmwiOiJodHRwczovL3d3dy5pYW1zLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjkzOTEvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy91a3FtaXN1d3VvemVlenZyaDVmZS5wbmciLCJvZmZpY2lhbF9pbmdyZWRpZW50X2NvdW50Ijo0NCwib2ZmaWNpYWxfZGF0YWJhc2VfaW5ncmVkaWVudF9oYXNoIjoiODNlOTE3MzdjYzZlN2E3ZWUwYTE4MTk5OGUzYjc2OTIyNmJkMjQ1NzU3NzI2ODc0MjE5N2U2MjA2MjcxYmIxNCIsIm9mZmljaWFsX2Nhbm9uaWNhbF9pbmdyZWRpZW50X2hhc2giOiI1ZGMwOTI2MWQzZWYzMzE3ODQ2YTkxM2YxNDI0ODdiNjNlMGMxMzY3Zjk2MzVkNjBiZWMyMDIzYmZmY2NiNDAyIiwib2ZmaWNpYWxfcmF3X2luZ3JlZGllbnRfaGFzaCI6ImIzZWMxODU1OWJkNGYyY2U4MDEyZjQxNzM0ODdlN2ZkMWIzYmU0ZDcwNzBjZGEzNTcxYjEyNWI5MWNmZGI1ZTAiLCJvZmZpY2lhbF9vYnNlcnZlZF9hdCI6IjIwMjYtMDctMjZUMTE6NDA6MzUuMTI4KzAwOjAwIiwiZm9ybXVsYV9pZF9oaW50IjoiNTg5ZTk5MjQtMTNlYy00ZjAzLWIxY2EtYjcyYjY2NDEzNzExIiwiYXVkaXRfc2NvcmUiOjEsImF1ZGl0X21hcmdpbiI6MC4yNSwiYXVkaXRfc2hhcmVkX3Rlcm1zIjpbInByb2FjdGl2ZSIsImhlYWx0aCIsInByb3RlaW4iLCJjaGlja2VuIiwiYmVlZiJdfSx7ImFsaWFzX2Zvcm11bGFfa2V5IjoiaWFtc3xpYW1zfGlhbXMgYWR2YW5jZWQgaGVhbHRoIGFkdWx0IGhlYWx0aHkgZGlnZXN0aW9uIHdpdGggcmVhbCBjaGlja2VuIGRyeSBkb2cgZm9vZHxkb2d8YWR1bHR8ZHJ5fHwiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuY2hld3kuY29tL2lhbXMtYWR2YW5jZWQtaGVhbHRoLWhlYWx0aHkvZHAvMzg4NjY3Iiwib2ZmaWNpYWxfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LmlhbXMuY29tL3Byb2R1Y3RzL2RyeS9pYW1zLWFkdmFuY2VkLWhlYWx0aC1oZWFsdGh5LWRpZ2VzdGlvbiIsImNhY2hlX2tleSI6ImlhbXM6MDE5MDE0ODA1NzQ3IiwidGFyZ2V0X2Zvcm11bGFfa2V5IjoiaWFtc3xpYW1zfGlhbXMgYWR2YW5jZWQgaGVhbHRoIGhlYWx0aHkgZGlnZXN0aW9ufGRvZ3xhZHVsdHxkcnl8Y2hpY2tlbnwiLCJyZXZpZXdlZF9hdCI6IjIwMjYtMDgtMTBUMDQ6MjA6MDAuMDAwWiIsInJldmlld19tZXRob2QiOiJwdWJsaWNfcmV0YWlsZXJfZnJvbnRfb2NyX3RvX29mZmljaWFsX3N0cnVjdHVyZWRfaWRlbnRpdHlfbWFudWFsX3JldmlldyIsInJldmlld19yZWFzb24iOiJNYW51YWwgcmV2aWV3IG9mIHRoZSBwdWJsaWMgcmV0YWlsZXIgcGFja2FnZSBmcm9udCBjb25maXJtcyB0aGUgc2FtZSBJQU1TIGxpbmUsIHNwZWNpZXMsIGZvb2QgZm9ybSwgbGlmZSBzdGFnZSwgcmVjaXBlLCBwcmVzZW50YXRpb24sIGFuZCBjb25kaXRpb24gYXMgb25lIG1hbnVmYWN0dXJlci1jdXJyZW50IGZvcm11bGEuIEZyb250LWxhYmVsIE9DUiBpcyBpZGVudGl0eSBldmlkZW5jZSBvbmx5OyBpbmdyZWRpZW50cyBhbmQgdGhlIHNlcnZpbmcgaW1hZ2UgcmVtYWluIGJvdW5kIHRvIHRoZSBtYW51ZmFjdHVyZXIgcm93LiIsInJldGFpbGVyX2lkZW50aXR5X29ubHkiOnRydWUsInJldGFpbGVyX2luZ3JlZGllbnRfdmVyaWZpY2F0aW9uIjpmYWxzZSwicmV0YWlsZXJfc291cmNlX3NsdWciOiJjaGV3eS1wdWJsaWMtc2l0ZW1hcCIsInJldGFpbGVyX3Byb2R1Y3RfaWQiOiIzODg2NjciLCJyZXRhaWxlcl90aXRsZSI6IklhbXMgQWR2YW5jZWQgSGVhbHRoIEFkdWx0IEhlYWx0aHkgRGlnZXN0aW9uIHdpdGggUmVhbCBDaGlja2VuIERyeSBEb2cgRm9vZCIsInJldGFpbGVyX29ic2VydmVkX2F0IjoiMjAyNi0wNy0yNFQyMToxMTo1Mi4yNzFaIiwicmV0YWlsZXJfY29udGVudF9oYXNoIjoiNDQwOGFhNzY0ZTBkZjlmNzg3MTkyNGIwNzE2ZmUwNjVkZmE2MjE1YTNiMDIwZWY0YzRmYjRjMmRjYzA2MzdkZCIsInJldGFpbGVyX2Zyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vaW1hZ2UuY2hld3kuY29tL2NhdGFsb2cvZ2VuZXJhbC9pbWFnZXMvbW9lLzA2OTJmMWMyLThiNmMtNzNmOS04MDAwLTQ2NjIyZTkyOTFhNi5fVjFfLmpwZyIsInJldGFpbGVyX2Zyb250X2ltYWdlX3NoYTI1NiI6ImExNmQ4NjExNDUxNTZhMjA3MjY0OTU3M2RmYzk1ZjZmOGRlNzJiNzMxNWMyNzA1Y2RiMDBhNDdmZmE0Y2FmNzUiLCJyZXRhaWxlcl9mcm9udF9sYWJlbF9vY3IiOiJJQU1T4oCiOiBBRFZBTkNFRCBIRUFMVEgtIEhFQUxUSFkgRElHRVNUSU9OIENISUNLRU4gJiBXSE9MRSBHUkFJTiBSRUNJUEUgQ0xJTklDQUxMWSBQUk9WRU4gUFJFQklPVElDIFRPIFBST01PVEUgSEVBTFRIWSBESUdFU1RJT04gMjdMQiBBRFVMVDErIiwibWFudWFsX3BhY2thZ2VfaW1hZ2VfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF9vY3JfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF92aXN1YWxfbWF0Y2giOnRydWUsInJlcXVpcmVkX29jcl90ZXJtcyI6WyJhZHZhbmNlZCBoZWFsdGgiLCJoZWFsdGh5IGRpZ2VzdGlvbiIsImNoaWNrZW4iLCJ3aG9sZSBncmFpbiByZWNpcGUiLCJjbGluaWNhbGx5IHByb3ZlbiBwcmViaW90aWMiLCIyN2xiIiwiYWR1bHQxIl0sInByb3RlY3RlZF9pZGVudGl0eV90ZXJtcyI6WyJpYW1zIGFkdmFuY2VkIGhlYWx0aCIsImhlYWx0aHkgZGlnZXN0aW9uIiwiY2hpY2tlbiBhbmQgd2hvbGUgZ3JhaW4gcmVjaXBlIiwiY2xpbmljYWxseSBwcm92ZW4gcHJlYmlvdGljIHRvIHByb21vdGUgaGVhbHRoeSBkaWdlc3Rpb24iLCIyNyBsYiIsImFkdWx0IDErIl0sIm9ic2VydmVkX2lkZW50aXR5Ijp7ImJyYW5kIjoiaWFtcyIsInBldF90eXBlIjoiZG9nIiwibGlmZV9zdGFnZSI6ImFkdWx0IiwiZm9vZF9mb3JtIjoiZHJ5In0sInRhcmdldF9pZGVudGl0eSI6eyJicmFuZCI6IklBTVMiLCJwcm9kdWN0X25hbWUiOiJJQU1TIEFEVkFOQ0VEIEhFQUxUSCBIRUFMVEhZIERJR0VTVElPTiIsInByb2R1Y3RfbGluZSI6IkFkdmFuY2VkIEhlYWx0aCIsImZsYXZvciI6IkNoaWNrZW4iLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJhZHVsdCIsImZvb2RfZm9ybSI6ImRyeSIsInBhY2thZ2Vfc2l6ZSI6IjYsIDEzLjUsIDI3LCAzNiJ9LCJvZmZpY2lhbF9kYXRhYmFzZV9pbWFnZV91cmwiOiJodHRwczovL3d3dy5pYW1zLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjkzOTEvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy9hcG80a3VqeXZxOWZmY2V3eDNwdi5wbmciLCJvZmZpY2lhbF9pbWFnZV91cmwiOiJodHRwczovL3d3dy5pYW1zLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjkzOTEvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy9hcG80a3VqeXZxOWZmY2V3eDNwdi5wbmciLCJvZmZpY2lhbF9pbmdyZWRpZW50X2NvdW50Ijo0MCwib2ZmaWNpYWxfZGF0YWJhc2VfaW5ncmVkaWVudF9oYXNoIjoiY2JjYmRiMTBmMzE5M2VkMzQ0NzRlMWRhNGRiYjg1ZTQyMTk1MmRkZWQyYmNiOGViZGIwYmRhYTgwNTZiNDQwMCIsIm9mZmljaWFsX2Nhbm9uaWNhbF9pbmdyZWRpZW50X2hhc2giOiI2NDJmMWY2MTQ3ODU1Zjk0MjhlYjc1Y2ViYWVhODRiMzUwYzk4ZTFmMWU3YzQ1MDBjZjJmZTcyMWZiODRlMDE1Iiwib2ZmaWNpYWxfcmF3X2luZ3JlZGllbnRfaGFzaCI6IjRmM2I1MDM5ZWE5MzZjYjZiOTgzOTBkMmQ3Y2I0MGU3ZjJkNjJlYzIwMmEzN2MyZDNkNDViNWU1ZGVjMmE4MGIiLCJvZmZpY2lhbF9vYnNlcnZlZF9hdCI6IjIwMjYtMDctMjZUMTE6NDA6MzUuMTI4KzAwOjAwIiwiZm9ybXVsYV9pZF9oaW50IjoiY2FmMTZhNzctY2QyZS00YWQyLWFkN2UtODU5ODVlMmY5MWM2IiwiYXVkaXRfc2NvcmUiOjEsImF1ZGl0X21hcmdpbiI6MC4zNzUsImF1ZGl0X3NoYXJlZF90ZXJtcyI6WyJhZHZhbmNlZCIsImhlYWx0aCIsImhlYWx0aHkiLCJkaWdlc3Rpb24iLCJjaGlja2VuIl19LHsiYWxpYXNfZm9ybXVsYV9rZXkiOiJpYW1zfGlhbXN8aWFtcyBwcm9hY3RpdmUgaGVhbHRoIGNvcmUgbGFtYiBmbGF2b3Igd2V0IGRvZyBmb29kIDN8ZG9nfHVua25vd258d2V0fHwiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cudGFyZ2V0LmNvbS9wL2lhbXMtcHJvYWN0aXZlLWhlYWx0aC1jb3JlLWxhbWItZmxhdm9yLXdldC1kb2ctZm9vZC0zLTVvei8tL0EtOTQ4OTQ1MDAiLCJvZmZpY2lhbF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuaWFtcy5jb20vcHJvZHVjdHMvd2V0L2lhbXMtcHJvYWN0aXZlLWhlYWx0aC1hZHVsdC1sYW1iLXBlYXMtYW5kLWNhcnJvdHMtcmVjaXBlLXdldC1kb2ctZm9vZCIsImNhY2hlX2tleSI6ImlhbXM6MDE5MDE0ODA4ODU0IiwidGFyZ2V0X2Zvcm11bGFfa2V5IjoiaWFtc3xpYW1zfGlhbXMgcHJvYWN0aXZlIGhlYWx0aCBhZHVsdCBsYW1iIHBlYXMgYW5kIGNhcnJvdHMgcmVjaXBlIHdldCBkb2cgZm9vZHxkb2d8YWR1bHR8d2V0fHBlYXMgYW5kIGNhcnJvdHMgcmVjaXBlfCIsInJldmlld2VkX2F0IjoiMjAyNi0wOC0xMFQwNDoyMDowMC4wMDBaIiwicmV2aWV3X21ldGhvZCI6InB1YmxpY19yZXRhaWxlcl9mcm9udF9vY3JfdG9fb2ZmaWNpYWxfc3RydWN0dXJlZF9pZGVudGl0eV9tYW51YWxfcmV2aWV3IiwicmV2aWV3X3JlYXNvbiI6Ik1hbnVhbCByZXZpZXcgb2YgdGhlIHB1YmxpYyByZXRhaWxlciBwYWNrYWdlIGZyb250IGNvbmZpcm1zIHRoZSBzYW1lIElBTVMgbGluZSwgc3BlY2llcywgZm9vZCBmb3JtLCBsaWZlIHN0YWdlLCByZWNpcGUsIHByZXNlbnRhdGlvbiwgYW5kIGNvbmRpdGlvbiBhcyBvbmUgbWFudWZhY3R1cmVyLWN1cnJlbnQgZm9ybXVsYS4gRnJvbnQtbGFiZWwgT0NSIGlzIGlkZW50aXR5IGV2aWRlbmNlIG9ubHk7IGluZ3JlZGllbnRzIGFuZCB0aGUgc2VydmluZyBpbWFnZSByZW1haW4gYm91bmQgdG8gdGhlIG1hbnVmYWN0dXJlciByb3cuIiwicmV0YWlsZXJfaWRlbnRpdHlfb25seSI6dHJ1ZSwicmV0YWlsZXJfaW5ncmVkaWVudF92ZXJpZmljYXRpb24iOmZhbHNlLCJyZXRhaWxlcl9zb3VyY2Vfc2x1ZyI6InRhcmdldC1wdWJsaWMtc2l0ZW1hcCIsInJldGFpbGVyX3Byb2R1Y3RfaWQiOiJBLTk0ODk0NTAwIiwicmV0YWlsZXJfdGl0bGUiOiJpYW1zIHByb2FjdGl2ZSBoZWFsdGggY29yZSBsYW1iIGZsYXZvciB3ZXQgZG9nIGZvb2QgMyIsInJldGFpbGVyX29ic2VydmVkX2F0IjoiMjAyNi0wNy0yNFQyMToxMTo1My4wNzBaIiwicmV0YWlsZXJfY29udGVudF9oYXNoIjoiMmJmYWI5MDEwNDY4OTM2NWFiYjVkZThjY2ZmZjYzOWI0NGY4ZDA2MWVhOTU0OWM5MzdkODljYjI3NWVmYTQxOCIsInJldGFpbGVyX2Zyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vdGFyZ2V0LnNjZW5lNy5jb20vaXMvaW1hZ2UvVGFyZ2V0L0dVRVNUXzJkOTQ3YzEyLTBjNmMtNDJkNS1iZDNiLWI3ZjQ0Y2FlNzU3NCIsInJldGFpbGVyX2Zyb250X2ltYWdlX3NoYTI1NiI6IjU2N2Y2YWVlZDA3NmJjMDc0ZTcxYzg4NjBjMDBhZDI0ODg0YzU2Y2YwMDc5ZmIyOGYzMzI5N2IwZTRiMGQ2ZjciLCJyZXRhaWxlcl9mcm9udF9sYWJlbF9vY3IiOiJDTVZmbEtTIElNSVJhVlkgQURWTFQxKyBMQU1CLFBFQVMgJkNNUk9UU0hFVVBFIElBTVPigKI6IFBST0FDVElWRSBIRUFMVEguIDE0REVXSVRIIFJFQUxFQU1CIFNVUFBPUlRTIFdIT0xFQk9EWSBIRUFMVEggTk8gRklMTEVSUyIsIm1hbnVhbF9wYWNrYWdlX2ltYWdlX21hdGNoIjp0cnVlLCJtYW51YWxfZnJvbnRfbGFiZWxfb2NyX21hdGNoIjp0cnVlLCJtYW51YWxfZnJvbnRfbGFiZWxfdmlzdWFsX21hdGNoIjp0cnVlLCJyZXF1aXJlZF9vY3JfdGVybXMiOlsibGFtYiIsInBlYXMiLCJpYW1zIiwicHJvYWN0aXZlIGhlYWx0aCIsIndob2xlIGJvZHkgaGVhbHRoIiwibm8gZmlsbGVycyJdLCJwcm90ZWN0ZWRfaWRlbnRpdHlfdGVybXMiOlsiY2h1bmtzIGluIGdyYXZ5IiwiYWR1bHQgMSsiLCJsYW1iIHBlYXMgYW5kIGNhcnJvdHMgcmVjaXBlIiwiaWFtcyBwcm9hY3RpdmUgaGVhbHRoIiwibWFkZSB3aXRoIHJlYWwgbGFtYiIsInN1cHBvcnRzIHdob2xlIGJvZHkgaGVhbHRoIiwibm8gZmlsbGVycyJdLCJvYnNlcnZlZF9pZGVudGl0eSI6eyJicmFuZCI6ImlhbXMiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJ1bmtub3duIiwiZm9vZF9mb3JtIjoid2V0In0sInRhcmdldF9pZGVudGl0eSI6eyJicmFuZCI6IklBTVMiLCJwcm9kdWN0X25hbWUiOiJJQU1TIFByb2FjdGl2ZSBIZWFsdGggQWR1bHQgTGFtYiwgUGVhcyBhbmQgQ2Fycm90cyBSZWNpcGUgV2V0IERvZyBGb29kIiwicHJvZHVjdF9saW5lIjoiUHJvYWN0aXZlIEhlYWx0aOKEoiIsImZsYXZvciI6IlBlYXMgYW5kIENhcnJvdHMgUmVjaXBlIiwicGV0X3R5cGUiOiJkb2ciLCJsaWZlX3N0YWdlIjoiYWR1bHQiLCJmb29kX2Zvcm0iOiJ3ZXQiLCJwYWNrYWdlX3NpemUiOiIzLjUifSwib2ZmaWNpYWxfZGF0YWJhc2VfaW1hZ2VfdXJsIjoiaHR0cHM6Ly93d3cuaWFtcy5jb20vc2l0ZXMvZy9maWxlcy9mbm16ZGY5MzkxL2ZpbGVzL21pZ3JhdGUtcHJvZHVjdC1maWxlcy9pbWFnZXMvaXNmb3ZvYmNrbW5iczJzc2NzeHgucG5nIiwib2ZmaWNpYWxfaW1hZ2VfdXJsIjoiaHR0cHM6Ly93d3cuaWFtcy5jb20vc2l0ZXMvZy9maWxlcy9mbm16ZGY5MzkxL2ZpbGVzL21pZ3JhdGUtcHJvZHVjdC1maWxlcy9pbWFnZXMvaXNmb3ZvYmNrbW5iczJzc2NzeHgucG5nIiwib2ZmaWNpYWxfaW5ncmVkaWVudF9jb3VudCI6MzgsIm9mZmljaWFsX2RhdGFiYXNlX2luZ3JlZGllbnRfaGFzaCI6IjY1YzMxOGRmMzhjMDJhYjFkYTE3Y2Q3OTc2NDcwYjA5NTc2ZDExZmY0OGM4ZjY4ZGMwNjFmY2I1ODA4ODhmZjgiLCJvZmZpY2lhbF9jYW5vbmljYWxfaW5ncmVkaWVudF9oYXNoIjoiMjBkMzBhZDAzNTFkYTY2MTRjNzMwYjVlZTE5NmEzOTJhNzA2YjBmYWUyZWNkZmFlMWNjNzY0ZDUzZDY0MjIyZCIsIm9mZmljaWFsX3Jhd19pbmdyZWRpZW50X2hhc2giOiJlOWYyZjUxNzFiZDEyZTAzOTdiYWE1NDc2MDU5OGIyZjlhYWQ1ZmM5NjI1OTY1OWE4NzlhYzYzNmU2NmUwNDlhIiwib2ZmaWNpYWxfb2JzZXJ2ZWRfYXQiOiIyMDI2LTA3LTI2VDExOjQwOjM1LjEyOCswMDowMCIsImZvcm11bGFfaWRfaGludCI6IjBlYTM0YTg5LWRhZWEtNGZjMS1hODVjLWY4NDZlZTg3ZjA5NSIsImF1ZGl0X3Njb3JlIjowLjgsImF1ZGl0X21hcmdpbiI6MC4yLCJhdWRpdF9zaGFyZWRfdGVybXMiOlsicHJvYWN0aXZlIiwiaGVhbHRoIiwibGFtYiIsInBlYXMiXX1d', 'base64'),
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
    WHERE source_url = v_alias->>'official_source_url'
      AND lower(brand) = lower(v_serving.brand)
      AND pet_type = v_serving.pet_type
      AND COALESCE(life_stage, 'unknown') = COALESCE(v_serving.life_stage, 'unknown')
      AND COALESCE(food_form, 'unknown') = COALESCE(v_serving.food_form, 'unknown')
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
    v_review_key := 'deterministic-retailer-identity-wave-iams_public_front_ocr_a:'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-iams-public-front-ocr-wave-a/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-iams-public-front-ocr-wave-a/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-iams-public-front-ocr-wave-a/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-iams-public-front-ocr-wave-a/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-iams-public-front-ocr-wave-a/report.json'
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
      WHERE metadata->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260809-iams-public-front-ocr-wave-a/report.json') <>
      jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_manual_evidence_reviews
         WHERE review_key LIKE
           'deterministic-retailer-identity-wave-iams_public_front_ocr_a:%'
           AND evidence_status = 'promoted'
           AND formula_id IS NOT NULL) <> jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_verified_product_search_aliases
         WHERE active
           AND provenance->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260809-iams-public-front-ocr-wave-a/report.json') <>
           jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_field_evidence
         WHERE accepted
           AND field_name = 'retailer_exact_identity_alias'
           AND field_value->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260809-iams-public-front-ocr-wave-a/report.json') <>
           jsonb_array_length(v_payload) THEN
    RAISE EXCEPTION 'Wave iams_public_front_ocr_a evidence promotion postcondition failed';
  END IF;
END
$migration$;
