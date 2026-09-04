-- Deterministic retailer identity aliases, wave pedigree_public_front_ocr_a.
-- Generated from inputs/catalog-reviewed-pedigree-public-front-ocr-aliases-20260809.json after exact official/live evidence validation.
-- Retailer rows remain identity-only; this migration never copies retailer
-- ingredients or images into product_data and never changes scoring.

DO $migration$
DECLARE
  v_payload JSONB := convert_from(
    decode('W3siYWxpYXNfZm9ybXVsYV9rZXkiOiJwZWRpZ3JlZXxwZWRpZ3JlZXxwZWRpZ3JlZSBwdXBweSBncm93dGggYW5kIHByb3RlY3Rpb24gY2hpY2tlbiBhbmQgdmVnZXRhYmxlIGZsYXZvciBkcnkgZG9nIGZvb2R8ZG9nfHB1cHB5fGRyeXx8Iiwic291cmNlX3VybCI6Imh0dHBzOi8vd3d3LmNoZXd5LmNvbS9wZWRpZ3JlZS1wdXBweS1ncm93dGgtcHJvdGVjdGlvbi9kcC8zODg2ODYiLCJvZmZpY2lhbF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cucGVkaWdyZWUuY29tL3Byb2R1Y3RzL2RyeS9wdXBweS1kcnktZG9nLWZvb2QtY2hpY2tlbi1yaWNlLXZlZ2V0YWJsZSIsImNhY2hlX2tleSI6InBlZGlncmVlLW1hcnMtcGV0Y2FyZTowMjMxMDAxMDM2NTUiLCJ0YXJnZXRfZm9ybXVsYV9rZXkiOiJwZWRpZ3JlZXxwZWRpZ3JlZXxwdXBweSBkcnkgZG9nIGZvb2QgY2hpY2tlbiByaWNlIGFuZCB2ZWdldGFibGV8ZG9nfHB1cHB5fGRyeXxjaGlja2VuIHJpY2UgYW5kIHZlZ2V0YWJsZXwiLCJyZXZpZXdlZF9hdCI6IjIwMjYtMDgtMTBUMDQ6MTI6MDAuMDAwWiIsInJldmlld19tZXRob2QiOiJwdWJsaWNfcmV0YWlsZXJfZnJvbnRfb2NyX3RvX29mZmljaWFsX3N0cnVjdHVyZWRfaWRlbnRpdHlfbWFudWFsX3JldmlldyIsInJldmlld19yZWFzb24iOiJNYW51YWwgcmV2aWV3IG9mIHRoZSBwdWJsaWMgcmV0YWlsZXIgcGFja2FnZSBmcm9udCBjb25maXJtcyB0aGUgc2FtZSBQZWRpZ3JlZSBsaW5lLCBzcGVjaWVzLCBmb29kIGZvcm0sIGxpZmUgc3RhZ2UsIHJlY2lwZSwgcHJlc2VudGF0aW9uLCBhbmQgY29uZGl0aW9uIGFzIG9uZSBtYW51ZmFjdHVyZXItY3VycmVudCBmb3JtdWxhLiBGcm9udC1sYWJlbCBPQ1IgaXMgaWRlbnRpdHkgZXZpZGVuY2Ugb25seTsgaW5ncmVkaWVudHMgYW5kIHRoZSBzZXJ2aW5nIGltYWdlIHJlbWFpbiBib3VuZCB0byB0aGUgbWFudWZhY3R1cmVyIHJvdy4iLCJyZXRhaWxlcl9pZGVudGl0eV9vbmx5Ijp0cnVlLCJyZXRhaWxlcl9pbmdyZWRpZW50X3ZlcmlmaWNhdGlvbiI6ZmFsc2UsInJldGFpbGVyX3NvdXJjZV9zbHVnIjoiY2hld3ktcHVibGljLXNpdGVtYXAiLCJyZXRhaWxlcl9wcm9kdWN0X2lkIjoiMzg4Njg2IiwicmV0YWlsZXJfdGl0bGUiOiJQZWRpZ3JlZSBQdXBweSBHcm93dGggJiBQcm90ZWN0aW9uIENoaWNrZW4gJiBWZWdldGFibGUgRmxhdm9yIERyeSBEb2cgRm9vZCIsInJldGFpbGVyX29ic2VydmVkX2F0IjoiMjAyNi0wNy0yNFQyMToxMjowMi43NTZaIiwicmV0YWlsZXJfY29udGVudF9oYXNoIjoiZDA0M2UyNmQxMTZmNTRmN2I1MGUwNWMyMzI4MjQxNWY0YTUzMjZmNTY3YzFlZmNjNDkzYWQ2YWJmNzNlOWY2MCIsInJldGFpbGVyX2Zyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vaW1hZ2UuY2hld3kuY29tL2NhdGFsb2cvZ2VuZXJhbC9pbWFnZXMvbW9lLzA2YTFmNTYzLTllYWEtNzQ0NC04MDAwLTMxMzlkMTljYzM2OC5fVjFfLmpwZyIsInJldGFpbGVyX2Zyb250X2ltYWdlX3NoYTI1NiI6ImNjODAzNWQ0ZWQ3OWM1NzAzOGFiMDZiNjgwZTE5NmFmZDYyZDY5MzUxYWQxZTIzZTNiYTgyNmY5MzFmYjIxZWEiLCJyZXRhaWxlcl9mcm9udF9sYWJlbF9vY3IiOiJTVVBQT1JUUyBIRUFMVEggJiBWSVRBTElUWSBkaWdyIHB1cHB5IDEwMCUgQ29tcGxldGUgJiBCYWxhbmNlZCBGb29kIGZvciBQdXBwaWVzIENISUNLRU4sIFJJQ0UlIFZFR0VUQUJMRSBGTEFWT1IgMy41TEIgQkFHIiwibWFudWFsX3BhY2thZ2VfaW1hZ2VfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF9vY3JfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF92aXN1YWxfbWF0Y2giOnRydWUsInJlcXVpcmVkX29jcl90ZXJtcyI6WyJwdXBweSIsImNvbXBsZXRlIiwiYmFsYW5jZWQiLCJjaGlja2VuIiwicmljZSIsInZlZ2V0YWJsZSBmbGF2b3IiLCIzLjVsYiBiYWciXSwicHJvdGVjdGVkX2lkZW50aXR5X3Rlcm1zIjpbInBlZGlncmVlIiwicHVwcHkiLCIxMDAlIGNvbXBsZXRlIGFuZCBiYWxhbmNlZCBmb29kIGZvciBwdXBwaWVzIiwiY2hpY2tlbiByaWNlIGFuZCB2ZWdldGFibGUgZmxhdm9yIiwiMy41IGxiIGJhZyJdLCJvYnNlcnZlZF9pZGVudGl0eSI6eyJicmFuZCI6InBlZGlncmVlIiwicGV0X3R5cGUiOiJkb2ciLCJsaWZlX3N0YWdlIjoicHVwcHkiLCJmb29kX2Zvcm0iOiJkcnkifSwidGFyZ2V0X2lkZW50aXR5Ijp7ImJyYW5kIjoiUGVkaWdyZWUiLCJwcm9kdWN0X25hbWUiOiJQdXBweSBEcnkgRG9nIEZvb2QsIENoaWNrZW4sIFJpY2UgJiBWZWdldGFibGUiLCJwcm9kdWN0X2xpbmUiOiJQdXBweSIsImZsYXZvciI6IkNoaWNrZW4sIFJpY2UgJiBWZWdldGFibGUiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJwdXBweSIsImZvb2RfZm9ybSI6ImRyeSIsInBhY2thZ2Vfc2l6ZSI6IjMuNTAgTEIsIDMwIExCLCAxNCBMQiwgMTIgTEIifSwib2ZmaWNpYWxfZGF0YWJhc2VfaW1hZ2VfdXJsIjoiaHR0cHM6Ly93d3cucGVkaWdyZWUuY29tL3NpdGVzL2cvZmlsZXMvZm5temRmMzA3Ni9maWxlcy9taWdyYXRlLXByb2R1Y3QtZmlsZXMvaW1hZ2VzL3B2eWhsemR3eGd5N2ZqYjZybXd1LnBuZyIsIm9mZmljaWFsX2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LnBlZGlncmVlLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjMwNzYvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy9wdnlobHpkd3hneTdmamI2cm13dS5wbmciLCJvZmZpY2lhbF9pbmdyZWRpZW50X2NvdW50IjozOCwib2ZmaWNpYWxfZGF0YWJhc2VfaW5ncmVkaWVudF9oYXNoIjoiYTAyYTkxZTAyNDUwYmYxNGY0YzI1OTYxZTA5MTNlNWNlYjY5MzZlMjllMzU4NDdmYjE0MzEwMDIzNjRhZjVlNiIsIm9mZmljaWFsX2Nhbm9uaWNhbF9pbmdyZWRpZW50X2hhc2giOiIxMDY0MmZjZjI3MjJlMzk4ZWZkZjQwNzJkODNkYjQ3OTUzNmYxMTBkNDFhZWUxNWI5YThkNzM4ODhjMWIwNTI5Iiwib2ZmaWNpYWxfcmF3X2luZ3JlZGllbnRfaGFzaCI6ImFkMmNhYzU4MjliMTczYmM2ZDg2ZDk1OWFlMDBkODM0NDZmNWRhODEzOTk3M2ZhMzRmZDczNzRmY2MwZWFmNzciLCJvZmZpY2lhbF9vYnNlcnZlZF9hdCI6IjIwMjYtMDctMjZUMTI6MDI6NDUuNjU3KzAwOjAwIiwiZm9ybXVsYV9pZF9oaW50IjoiZTA5ZjQzYWMtYWRjYy00MTI1LWJmOGYtNGQ0NjQ4MGE0OTU3IiwiYXVkaXRfc2NvcmUiOjEsImF1ZGl0X21hcmdpbiI6MC41LCJhdWRpdF9zaGFyZWRfdGVybXMiOlsicHVwcHkiLCJjaGlja2VuIiwicmljZSIsInZlZ2V0YWJsZSJdfSx7ImFsaWFzX2Zvcm11bGFfa2V5IjoicGVkaWdyZWV8cGVkaWdyZWV8cGVkaWdyZWUgc21hbGwgZG9nIGNvbXBsZXRlIG51dHJpdGlvbiBncmlsbGVkIHN0ZWFrIGFuZCB2ZWdldGFibGUgZmxhdm9yIGRvZyBraWJibGUgc21hbGwgYnJlZWQgYWR1bHQgZHJ5IGRvZyBmb29kfGRvZ3xhZHVsdHxkcnl8fCIsInNvdXJjZV91cmwiOiJodHRwczovL3d3dy5jaGV3eS5jb20vcGVkaWdyZWUtc21hbGwtZG9nLWNvbXBsZXRlLW51dHJpdGlvbi9kcC8zOTQ1NzciLCJvZmZpY2lhbF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cucGVkaWdyZWUuY29tL3Byb2R1Y3RzL2RyeS9zbWFsbC1kb2ctYWR1bHQtZHJ5LWZvb2QtZ3JpbGxlZC1zdGVhay1hbmQtdmVnZXRhYmxlIiwiY2FjaGVfa2V5IjoicGVkaWdyZWUtbWFycy1wZXRjYXJlOjAyMzEwMDExMDM0OSIsInRhcmdldF9mb3JtdWxhX2tleSI6InBlZGlncmVlfHBlZGlncmVlfHNtYWxsIGRvZyBhZHVsdCBkcnkgZm9vZCBncmlsbGVkIHN0ZWFrIGFuZCB2ZWdldGFibGV8ZG9nfGFkdWx0fGRyeXxncmlsbGVkIHN0ZWFrIGFuZCB2ZWdldGFibGV8IiwicmV2aWV3ZWRfYXQiOiIyMDI2LTA4LTEwVDA0OjEyOjAwLjAwMFoiLCJyZXZpZXdfbWV0aG9kIjoicHVibGljX3JldGFpbGVyX2Zyb250X29jcl90b19vZmZpY2lhbF9zdHJ1Y3R1cmVkX2lkZW50aXR5X21hbnVhbF9yZXZpZXciLCJyZXZpZXdfcmVhc29uIjoiTWFudWFsIHJldmlldyBvZiB0aGUgcHVibGljIHJldGFpbGVyIHBhY2thZ2UgZnJvbnQgY29uZmlybXMgdGhlIHNhbWUgUGVkaWdyZWUgbGluZSwgc3BlY2llcywgZm9vZCBmb3JtLCBsaWZlIHN0YWdlLCByZWNpcGUsIHByZXNlbnRhdGlvbiwgYW5kIGNvbmRpdGlvbiBhcyBvbmUgbWFudWZhY3R1cmVyLWN1cnJlbnQgZm9ybXVsYS4gRnJvbnQtbGFiZWwgT0NSIGlzIGlkZW50aXR5IGV2aWRlbmNlIG9ubHk7IGluZ3JlZGllbnRzIGFuZCB0aGUgc2VydmluZyBpbWFnZSByZW1haW4gYm91bmQgdG8gdGhlIG1hbnVmYWN0dXJlciByb3cuIiwicmV0YWlsZXJfaWRlbnRpdHlfb25seSI6dHJ1ZSwicmV0YWlsZXJfaW5ncmVkaWVudF92ZXJpZmljYXRpb24iOmZhbHNlLCJyZXRhaWxlcl9zb3VyY2Vfc2x1ZyI6ImNoZXd5LXB1YmxpYy1zaXRlbWFwIiwicmV0YWlsZXJfcHJvZHVjdF9pZCI6IjM5NDU3NyIsInJldGFpbGVyX3RpdGxlIjoiUGVkaWdyZWUgU21hbGwgRG9nIENvbXBsZXRlIE51dHJpdGlvbiBHcmlsbGVkIFN0ZWFrICYgVmVnZXRhYmxlIEZsYXZvciBEb2cgS2liYmxlIFNtYWxsIEJyZWVkIEFkdWx0IERyeSBEb2cgRm9vZCIsInJldGFpbGVyX29ic2VydmVkX2F0IjoiMjAyNi0wNy0yNFQyMToxMjoyMy45MzJaIiwicmV0YWlsZXJfY29udGVudF9oYXNoIjoiOGU0MjE3ODAwNzA3M2NmMWMyMzgwODU1ZDIxMWYwYjQwM2E0NjRmYzY2MjljYzllNmM1ZjBhMWFmMmViOGE4YiIsInJldGFpbGVyX2Zyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vaW1hZ2UuY2hld3kuY29tL2NhdGFsb2cvZ2VuZXJhbC9pbWFnZXMvbW9lLzA2OGU2YmYxLTg3NzktNzEzOC04MDAwLWNmZjgyN2RiYTkyNC5fVjFfLmpwZyIsInJldGFpbGVyX2Zyb250X2ltYWdlX3NoYTI1NiI6IjY5ZTk5NjhiZTg1MmY0MGQ5ZDM0NjBkMTg2ODk5NDA0Y2I3NTgyYmE0ZjBlZTIwYmM2YmMzNjgyMWMyMGE3YjMiLCJyZXRhaWxlcl9mcm9udF9sYWJlbF9vY3IiOiJTTUFMTCBQSUVDRVMgRk9SIFNNQUxMIEkgTU9VVEhTIGRpZ3IgNDQgwqJzU2YgT1JTIC4gU01BTEwgRE9HIGxvbyUgQ29tcGxldGUgJiBCYWxhbmNlZCBGb29kIGZvciBBZHVsdCBEb2dzIEdSSUxMRUQgU1RFQUsgJiBWRUdFVEFCTEUgRkxBVk9SIDE0TEIgQkFHIiwibWFudWFsX3BhY2thZ2VfaW1hZ2VfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF9vY3JfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF92aXN1YWxfbWF0Y2giOnRydWUsInJlcXVpcmVkX29jcl90ZXJtcyI6WyJzbWFsbCBwaWVjZXMiLCJzbWFsbCBkb2ciLCJhZHVsdCBkb2dzIiwiZ3JpbGxlZCBzdGVhayIsInZlZ2V0YWJsZSBmbGF2b3IiLCIxNGxiIGJhZyJdLCJwcm90ZWN0ZWRfaWRlbnRpdHlfdGVybXMiOlsicGVkaWdyZWUiLCJzbWFsbCBkb2ciLCIxMDAlIGNvbXBsZXRlIGFuZCBiYWxhbmNlZCBmb29kIGZvciBhZHVsdCBkb2dzIiwiZ3JpbGxlZCBzdGVhayBhbmQgdmVnZXRhYmxlIGZsYXZvciIsIjE0IGxiIGJhZyJdLCJvYnNlcnZlZF9pZGVudGl0eSI6eyJicmFuZCI6InBlZGlncmVlIiwicGV0X3R5cGUiOiJkb2ciLCJsaWZlX3N0YWdlIjoiYWR1bHQiLCJmb29kX2Zvcm0iOiJkcnkifSwidGFyZ2V0X2lkZW50aXR5Ijp7ImJyYW5kIjoiUGVkaWdyZWUiLCJwcm9kdWN0X25hbWUiOiJTbWFsbCBEb2cgQWR1bHQgRHJ5IEZvb2QsIEdyaWxsZWQgU3RlYWsgYW5kIFZlZ2V0YWJsZSIsInByb2R1Y3RfbGluZSI6IlNtYWxsIERvZyIsImZsYXZvciI6IkdyaWxsZWQgU3RlYWsgYW5kIFZlZ2V0YWJsZSIsInBldF90eXBlIjoiZG9nIiwibGlmZV9zdGFnZSI6ImFkdWx0IiwiZm9vZF9mb3JtIjoiZHJ5IiwicGFja2FnZV9zaXplIjoiMy41MCBMQiwgMTQgTEIsIDEyIExCIn0sIm9mZmljaWFsX2RhdGFiYXNlX2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LnBlZGlncmVlLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjMwNzYvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy9mZG54am52czY4bDBzbWtucTdiZi5wbmciLCJvZmZpY2lhbF9pbWFnZV91cmwiOiJodHRwczovL3d3dy5wZWRpZ3JlZS5jb20vc2l0ZXMvZy9maWxlcy9mbm16ZGYzMDc2L2ZpbGVzL21pZ3JhdGUtcHJvZHVjdC1maWxlcy9pbWFnZXMvZmRueGpudnM2OGwwc21rbnE3YmYucG5nIiwib2ZmaWNpYWxfaW5ncmVkaWVudF9jb3VudCI6MzcsIm9mZmljaWFsX2RhdGFiYXNlX2luZ3JlZGllbnRfaGFzaCI6Ijg4MmQ2MTFiMjczYzU3ZGM3M2JiYjdkNjRlYWI3OWNlMGMyNjg1YjI4YjgyY2JhODQxODI4OWVlMDE5NjU3YzUiLCJvZmZpY2lhbF9jYW5vbmljYWxfaW5ncmVkaWVudF9oYXNoIjoiOTJjZGYzMjBmZGU3NWM1NjY1OGMxNmU4OGFiMjMzYjVhMTVkMWM5M2MwY2E1OWY4ZjgwOTViOTk2NGM5ZjE4OSIsIm9mZmljaWFsX3Jhd19pbmdyZWRpZW50X2hhc2giOiI2NzgyMDM4NzgwMjk2MjRmNDRkZWViMTU1NGY4MGU2YTc4MmYzOGRiZTAyZjQwNjE5YTExZDk4MDRlZTlmYWEwIiwib2ZmaWNpYWxfb2JzZXJ2ZWRfYXQiOiIyMDI2LTA3LTI2VDEyOjAyOjQ1LjY1NyswMDowMCIsImZvcm11bGFfaWRfaGludCI6IjUzM2FiNjNlLTg5NGMtNDQxOS1hZjU3LTI5NGI1MmM0MzBlMSIsImF1ZGl0X3Njb3JlIjoxLCJhdWRpdF9tYXJnaW4iOjAuMiwiYXVkaXRfc2hhcmVkX3Rlcm1zIjpbInNtYWxsIiwiZ3JpbGxlZCIsInN0ZWFrIiwidmVnZXRhYmxlIl19LHsiYWxpYXNfZm9ybXVsYV9rZXkiOiJwZWRpZ3JlZXxwZWRpZ3JlZXxwZWRpZ3JlZSB3aXRoIG1hcnJvYml0ZXMgcGllY2VzIHN0ZWFrIGFuZCB2ZWdldGFibGUgZmxhdm9yIGFkdWx0IGRyeSBkb2cgZm9vZHxkb2d8YWR1bHR8ZHJ5fHwiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuY2hld3kuY29tL3BlZGlncmVlLW1hcnJvYml0ZXMtcGllY2VzLXN0ZWFrL2RwLzU3MzQzOCIsIm9mZmljaWFsX3NvdXJjZV91cmwiOiJodHRwczovL3d3dy5wZWRpZ3JlZS5jb20vcHJvZHVjdHMvZHJ5L3BlZGlncmVlLW1hcnJvYml0ZXMtYWR1bHQtZHJ5LWRvZy1mb29kLWdyaWxsZWQtc3RlYWstYW5kLXZlZ2V0YWJsZSIsImNhY2hlX2tleSI6InBlZGlncmVlLW1hcnMtcGV0Y2FyZTowMjMxMDAxNDQ0NzQiLCJ0YXJnZXRfZm9ybXVsYV9rZXkiOiJwZWRpZ3JlZXxwZWRpZ3JlZXxwZWRpZ3JlZSB3aXRoIG1hcnJvYml0ZXMgYWR1bHQgZHJ5IGRvZyBmb29kIGdyaWxsZWQgc3RlYWsgYW5kIHZlZ2V0YWJsZXxkb2d8YWR1bHR8ZHJ5fGdyaWxsZWQgc3RlYWsgYW5kIHZlZ2V0YWJsZXwiLCJyZXZpZXdlZF9hdCI6IjIwMjYtMDgtMTBUMDQ6MTI6MDAuMDAwWiIsInJldmlld19tZXRob2QiOiJwdWJsaWNfcmV0YWlsZXJfZnJvbnRfb2NyX3RvX29mZmljaWFsX3N0cnVjdHVyZWRfaWRlbnRpdHlfbWFudWFsX3JldmlldyIsInJldmlld19yZWFzb24iOiJNYW51YWwgcmV2aWV3IG9mIHRoZSBwdWJsaWMgcmV0YWlsZXIgcGFja2FnZSBmcm9udCBjb25maXJtcyB0aGUgc2FtZSBQZWRpZ3JlZSBsaW5lLCBzcGVjaWVzLCBmb29kIGZvcm0sIGxpZmUgc3RhZ2UsIHJlY2lwZSwgcHJlc2VudGF0aW9uLCBhbmQgY29uZGl0aW9uIGFzIG9uZSBtYW51ZmFjdHVyZXItY3VycmVudCBmb3JtdWxhLiBGcm9udC1sYWJlbCBPQ1IgaXMgaWRlbnRpdHkgZXZpZGVuY2Ugb25seTsgaW5ncmVkaWVudHMgYW5kIHRoZSBzZXJ2aW5nIGltYWdlIHJlbWFpbiBib3VuZCB0byB0aGUgbWFudWZhY3R1cmVyIHJvdy4iLCJyZXRhaWxlcl9pZGVudGl0eV9vbmx5Ijp0cnVlLCJyZXRhaWxlcl9pbmdyZWRpZW50X3ZlcmlmaWNhdGlvbiI6ZmFsc2UsInJldGFpbGVyX3NvdXJjZV9zbHVnIjoiY2hld3ktcHVibGljLXNpdGVtYXAiLCJyZXRhaWxlcl9wcm9kdWN0X2lkIjoiNTczNDM4IiwicmV0YWlsZXJfdGl0bGUiOiJQZWRpZ3JlZSB3aXRoIE1hcnJvQml0ZXMgUGllY2VzIFN0ZWFrICYgVmVnZXRhYmxlIEZsYXZvciBBZHVsdCBEcnkgRG9nIEZvb2QiLCJyZXRhaWxlcl9vYnNlcnZlZF9hdCI6IjIwMjYtMDctMjRUMjE6MTI6MTYuNTMxWiIsInJldGFpbGVyX2NvbnRlbnRfaGFzaCI6IjNiMjAwMDM3YTZlMjRiOGFmMDlkOWU2MjE5NTFhZjM4ZWRhY2Y4MjFiNDRhZjBkNWY2ZmM5ZTQ3OGZlYjE0ZTYiLCJyZXRhaWxlcl9mcm9udF9pbWFnZV91cmwiOiJodHRwczovL2ltYWdlLmNoZXd5LmNvbS9jYXRhbG9nL2dlbmVyYWwvaW1hZ2VzL21vZS8wNjhlNmJlOS03YmZlLTdiODUtODAwMC0wOThlNzg3MzkxZTAuX1YxXy5qcGciLCJyZXRhaWxlcl9mcm9udF9pbWFnZV9zaGEyNTYiOiJiMjUyYWQyOWNhZDhhMjcwNTU1YmU4ZmZjYWM2YmE3MzMxM2FkMTRmZDQ4ZDYxYzAzZWIxMzE0NmZjNTViNTUzIiwicmV0YWlsZXJfZnJvbnRfbGFiZWxfb2NyIjoiUElFQ0VTIFdJVEggUkVBTCBCT05FIE1BUlJPVyBkaWdyIE1hcnJvQiBlcyBFQ0VTV0lZSFJFQWJCT07Co01BUkJPVyBXaXRoIE1hcnJvQml0ZXMtIFBpZWNlcyBJT09ZLiBDb21wbGV0ZSAmIEJhbGFuZWVkIEZvb2QgZm9yIEFkdWx0IERvZ3MgR1JJTExFRCBTVEVBSyAmIFZFR0VUQUJMRSBGTEFWT1IgMTRMQiBCQUciLCJtYW51YWxfcGFja2FnZV9pbWFnZV9tYXRjaCI6dHJ1ZSwibWFudWFsX2Zyb250X2xhYmVsX29jcl9tYXRjaCI6dHJ1ZSwibWFudWFsX2Zyb250X2xhYmVsX3Zpc3VhbF9tYXRjaCI6dHJ1ZSwicmVxdWlyZWRfb2NyX3Rlcm1zIjpbInJlYWwgYm9uZSBtYXJyb3ciLCJtYXJyb2JpdGVzIiwiYWR1bHQgZG9ncyIsImdyaWxsZWQgc3RlYWsiLCJ2ZWdldGFibGUgZmxhdm9yIiwiMTRsYiBiYWciXSwicHJvdGVjdGVkX2lkZW50aXR5X3Rlcm1zIjpbInBlZGlncmVlIiwicGllY2VzIHdpdGggcmVhbCBib25lIG1hcnJvdyIsIndpdGggbWFycm9iaXRlcyBwaWVjZXMiLCJncmlsbGVkIHN0ZWFrIGFuZCB2ZWdldGFibGUgZmxhdm9yIiwiMTQgbGIgYmFnIl0sIm9ic2VydmVkX2lkZW50aXR5Ijp7ImJyYW5kIjoicGVkaWdyZWUiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJhZHVsdCIsImZvb2RfZm9ybSI6ImRyeSJ9LCJ0YXJnZXRfaWRlbnRpdHkiOnsiYnJhbmQiOiJQZWRpZ3JlZSIsInByb2R1Y3RfbmFtZSI6IlBlZGlncmVlIHdpdGggTWFycm9CaXRlcyBBZHVsdCBEcnkgRG9nIEZvb2QsIEdyaWxsZWQgU3RlYWsgYW5kIFZlZ2V0YWJsZSIsInByb2R1Y3RfbGluZSI6Ik1BUlJPQklURVPihKIiLCJmbGF2b3IiOiJHcmlsbGVkIFN0ZWFrIGFuZCBWZWdldGFibGUiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJhZHVsdCIsImZvb2RfZm9ybSI6ImRyeSIsInBhY2thZ2Vfc2l6ZSI6IjEyIExCLCAzOCBMQiwgNDAgTEIifSwib2ZmaWNpYWxfZGF0YWJhc2VfaW1hZ2VfdXJsIjoiaHR0cHM6Ly93d3cucGVkaWdyZWUuY29tL3NpdGVzL2cvZmlsZXMvZm5temRmMzA3Ni9maWxlcy9taWdyYXRlLXByb2R1Y3QtZmlsZXMvaW1hZ2VzL2Vsc3Fkemhzb3A4czg1dTdmYzllLnBuZyIsIm9mZmljaWFsX2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LnBlZGlncmVlLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjMwNzYvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy9lbHNxZHpoc29wOHM4NXU3ZmM5ZS5wbmciLCJvZmZpY2lhbF9pbmdyZWRpZW50X2NvdW50IjozOSwib2ZmaWNpYWxfZGF0YWJhc2VfaW5ncmVkaWVudF9oYXNoIjoiZGY4ZDNmOGE3NzAxOTY3ODY1ZjZlYWZiZTgwYTEyNjRiYzRjOWJiZGY3NWIwMWIxNTdhZDIwMzU0ZTAwZGZiZiIsIm9mZmljaWFsX2Nhbm9uaWNhbF9pbmdyZWRpZW50X2hhc2giOiI5ZDc0M2JkMzQzNmVkNTUzNTMwYzJmZGRkOGZmYzMzMWMyNWI2NmM3ZWJiZjYyNDY0MmUzNTBmYzRjMDk3NjJlIiwib2ZmaWNpYWxfcmF3X2luZ3JlZGllbnRfaGFzaCI6ImY5ZGYwOGI0NGJkZTNhZTgyZjlmNTBkNDExMmI4OTQ0MjliYTgyMzMxN2FiM2RiNDdhZTE4ZjUxNTg0NzY0MTAiLCJvZmZpY2lhbF9vYnNlcnZlZF9hdCI6IjIwMjYtMDctMjZUMTI6MDI6NDUuNjU3KzAwOjAwIiwiZm9ybXVsYV9pZF9oaW50IjoiNzZiZmFlZjYtNTE5OC00NDM5LWJjYmYtMGUzMTkwZDRiZWVkIiwiYXVkaXRfc2NvcmUiOjEsImF1ZGl0X21hcmdpbiI6MC4yLCJhdWRpdF9zaGFyZWRfdGVybXMiOlsibWFycm9iaXRlcyIsImdyaWxsZWQiLCJzdGVhayIsInZlZ2V0YWJsZSJdfSx7ImFsaWFzX2Zvcm11bGFfa2V5IjoicGVkaWdyZWV8cGVkaWdyZWV8cGVkaWdyZWUgaGlnaCBwcm90ZWluIGJlZWYgYW5kIGxhbWIgZmxhdm9yIGRvZyBraWJibGUgYWR1bHQgZHJ5IGRvZyBmb29kfGRvZ3xhZHVsdHxkcnl8fCIsInNvdXJjZV91cmwiOiJodHRwczovL3d3dy5jaGV3eS5jb20vcGVkaWdyZWUtaGlnaC1wcm90ZWluLWJlZWYtbGFtYi9kcC85NTg5OTgiLCJvZmZpY2lhbF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cucGVkaWdyZWUuY29tL3Byb2R1Y3RzL2RyeS9oaWdoLXByb3RlaW4tYWR1bHQtZHJ5LWRvZy1mb29kLWJlZWYtYW5kLWxhbWIiLCJjYWNoZV9rZXkiOiJwZWRpZ3JlZS1tYXJzLXBldGNhcmU6MDIzMTAwMTI1NTQxIiwidGFyZ2V0X2Zvcm11bGFfa2V5IjoicGVkaWdyZWV8cGVkaWdyZWV8aGlnaCBwcm90ZWluIGFkdWx0IGRyeSBkb2cgZm9vZCBiZWVmIGFuZCBsYW1ifGRvZ3xhZHVsdHxkcnl8YmVlZiBhbmQgbGFtYnwiLCJyZXZpZXdlZF9hdCI6IjIwMjYtMDgtMTBUMDQ6MTI6MDAuMDAwWiIsInJldmlld19tZXRob2QiOiJwdWJsaWNfcmV0YWlsZXJfZnJvbnRfb2NyX3RvX29mZmljaWFsX3N0cnVjdHVyZWRfaWRlbnRpdHlfbWFudWFsX3JldmlldyIsInJldmlld19yZWFzb24iOiJNYW51YWwgcmV2aWV3IG9mIHRoZSBwdWJsaWMgcmV0YWlsZXIgcGFja2FnZSBmcm9udCBjb25maXJtcyB0aGUgc2FtZSBQZWRpZ3JlZSBsaW5lLCBzcGVjaWVzLCBmb29kIGZvcm0sIGxpZmUgc3RhZ2UsIHJlY2lwZSwgcHJlc2VudGF0aW9uLCBhbmQgY29uZGl0aW9uIGFzIG9uZSBtYW51ZmFjdHVyZXItY3VycmVudCBmb3JtdWxhLiBGcm9udC1sYWJlbCBPQ1IgaXMgaWRlbnRpdHkgZXZpZGVuY2Ugb25seTsgaW5ncmVkaWVudHMgYW5kIHRoZSBzZXJ2aW5nIGltYWdlIHJlbWFpbiBib3VuZCB0byB0aGUgbWFudWZhY3R1cmVyIHJvdy4iLCJyZXRhaWxlcl9pZGVudGl0eV9vbmx5Ijp0cnVlLCJyZXRhaWxlcl9pbmdyZWRpZW50X3ZlcmlmaWNhdGlvbiI6ZmFsc2UsInJldGFpbGVyX3NvdXJjZV9zbHVnIjoiY2hld3ktcHVibGljLXNpdGVtYXAiLCJyZXRhaWxlcl9wcm9kdWN0X2lkIjoiOTU4OTk4IiwicmV0YWlsZXJfdGl0bGUiOiJQZWRpZ3JlZSBIaWdoIFByb3RlaW4gQmVlZiAmIExhbWIgRmxhdm9yIERvZyBLaWJibGUgQWR1bHQgRHJ5IERvZyBGb29kIiwicmV0YWlsZXJfb2JzZXJ2ZWRfYXQiOiIyMDI2LTA3LTI0VDIxOjExOjUxLjAyN1oiLCJyZXRhaWxlcl9jb250ZW50X2hhc2giOiIxN2JiN2RjMjFiMjA2Yzk5MmVhOWNlM2ZjOTE0OWIxNTkxYmE1ZjI0ZjU1MTJlYjU1ODJlYTg3MjcxMjFiNGYzIiwicmV0YWlsZXJfZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly9pbWFnZS5jaGV3eS5jb20vY2F0YWxvZy9nZW5lcmFsL2ltYWdlcy9tb2UvMDY4ZTZiZWYtMDI2OC03OWI3LTgwMDAtNGFhOTgwNDNiOTMxLl9WMV8uanBnIiwicmV0YWlsZXJfZnJvbnRfaW1hZ2Vfc2hhMjU2IjoiY2EzMDZiZDA3ODg4ODY4ZmZkYjlmNTA3YmU0N2QwOWRkMGM0NjE1YmM1MDI4MDhhNzc5MTE5MDY0MTQ3ZDA2NSIsInJldGFpbGVyX2Zyb250X2xhYmVsX29jciI6IjI1JSBNT1JFIFBST1RFSU4gSElHSCBQUk9URUlOIFdJVEggUkVEIE1FQVQgMTAwJSBDb21wbGV0ZSAmIEJhbGFuY2VkIEZvb2QgZm9yIEFkdWx0IERvZ3MgQkVFRiAmIExBTUIgRkxBVk9SIDMwTEIgQkFHIiwibWFudWFsX3BhY2thZ2VfaW1hZ2VfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF9vY3JfbWF0Y2giOnRydWUsIm1hbnVhbF9mcm9udF9sYWJlbF92aXN1YWxfbWF0Y2giOnRydWUsInJlcXVpcmVkX29jcl90ZXJtcyI6WyIyNSUgbW9yZSBwcm90ZWluIiwiaGlnaCBwcm90ZWluIiwicmVkIG1lYXQiLCJhZHVsdCBkb2dzIiwiYmVlZiIsImxhbWIgZmxhdm9yIiwiMzBsYiBiYWciXSwicHJvdGVjdGVkX2lkZW50aXR5X3Rlcm1zIjpbInBlZGlncmVlIiwiMjUlIG1vcmUgcHJvdGVpbiIsImhpZ2ggcHJvdGVpbiB3aXRoIHJlZCBtZWF0IiwiMTAwJSBjb21wbGV0ZSBhbmQgYmFsYW5jZWQgZm9vZCBmb3IgYWR1bHQgZG9ncyIsImJlZWYgYW5kIGxhbWIgZmxhdm9yIiwiMzAgbGIgYmFnIl0sIm9ic2VydmVkX2lkZW50aXR5Ijp7ImJyYW5kIjoicGVkaWdyZWUiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJhZHVsdCIsImZvb2RfZm9ybSI6ImRyeSJ9LCJ0YXJnZXRfaWRlbnRpdHkiOnsiYnJhbmQiOiJQZWRpZ3JlZSIsInByb2R1Y3RfbmFtZSI6IkhpZ2ggUHJvdGVpbiBBZHVsdCBEcnkgRG9nIEZvb2QsIEJlZWYgYW5kIExhbWIiLCJwcm9kdWN0X2xpbmUiOiJIaWdoIFByb3RlaW4iLCJmbGF2b3IiOiJCZWVmIGFuZCBMYW1iIiwicGV0X3R5cGUiOiJkb2ciLCJsaWZlX3N0YWdlIjoiYWR1bHQiLCJmb29kX2Zvcm0iOiJkcnkiLCJwYWNrYWdlX3NpemUiOiIzLjUwIExCLCA0NCBMQiwgMzAgTEIsIDE4IExCLCAxNCBMQiwgMjcgTEIifSwib2ZmaWNpYWxfZGF0YWJhc2VfaW1hZ2VfdXJsIjoiaHR0cHM6Ly93d3cucGVkaWdyZWUuY29tL3NpdGVzL2cvZmlsZXMvZm5temRmMzA3Ni9maWxlcy9taWdyYXRlLXByb2R1Y3QtZmlsZXMvaW1hZ2VzL3lrdDF6dG15YzVpaXlzd2d6cWxvLnBuZyIsIm9mZmljaWFsX2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LnBlZGlncmVlLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjMwNzYvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy95a3QxenRteWM1aWl5c3dnenFsby5wbmciLCJvZmZpY2lhbF9pbmdyZWRpZW50X2NvdW50IjozOSwib2ZmaWNpYWxfZGF0YWJhc2VfaW5ncmVkaWVudF9oYXNoIjoiMWFmMzhlNDc3Zjk5YmJkNWVjM2ZkNmI1NTExNDNkNmY5MTU2ZDg5Nzg5MTI1NjY5YjllNTVjZmViYjAxNjhkMSIsIm9mZmljaWFsX2Nhbm9uaWNhbF9pbmdyZWRpZW50X2hhc2giOiJhN2UwNDVkZjFjMzlkN2FiYmY1OTliYTNmYjY4OWY5MDNhMTExMDRiNTc0NjUzZGQ5NGU2MTJjMGJlMzE4MjJjIiwib2ZmaWNpYWxfcmF3X2luZ3JlZGllbnRfaGFzaCI6IjFhODBhNTA5ZmIwYzU2MDM3ODY3YWM2YTQ4NzA3ZWI4N2QxNjY3ODcxNjk4NGUxM2E5YzYxZTIwZWFhOGRmM2IiLCJvZmZpY2lhbF9vYnNlcnZlZF9hdCI6IjIwMjYtMDctMjZUMTI6MDI6NDUuNjU3KzAwOjAwIiwiZm9ybXVsYV9pZF9oaW50IjoiMWVhOGIyNWYtZDQxOS00ZDJhLWJiZGQtNTExMDJlNDE3NTA4IiwiYXVkaXRfc2NvcmUiOjEsImF1ZGl0X21hcmdpbiI6MC41LCJhdWRpdF9zaGFyZWRfdGVybXMiOlsicHJvdGVpbiIsImJlZWYiLCJsYW1iIl19XQ==', 'base64'),
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
    v_review_key := 'deterministic-retailer-identity-wave-pedigree_public_front_ocr_a:'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-pedigree-public-front-ocr-wave-a/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-pedigree-public-front-ocr-wave-a/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-pedigree-public-front-ocr-wave-a/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-pedigree-public-front-ocr-wave-a/report.json'
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
        'audit_artifact', 'outputs/catalog-deterministic-reconciliation-batches/20260809-pedigree-public-front-ocr-wave-a/report.json'
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
      WHERE metadata->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260809-pedigree-public-front-ocr-wave-a/report.json') <>
      jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_manual_evidence_reviews
         WHERE review_key LIKE
           'deterministic-retailer-identity-wave-pedigree_public_front_ocr_a:%'
           AND evidence_status = 'promoted'
           AND formula_id IS NOT NULL) <> jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_verified_product_search_aliases
         WHERE active
           AND provenance->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260809-pedigree-public-front-ocr-wave-a/report.json') <>
           jsonb_array_length(v_payload)
     OR (SELECT count(*) FROM public.catalog_field_evidence
         WHERE accepted
           AND field_name = 'retailer_exact_identity_alias'
           AND field_value->>'audit_artifact' = 'outputs/catalog-deterministic-reconciliation-batches/20260809-pedigree-public-front-ocr-wave-a/report.json') <>
           jsonb_array_length(v_payload) THEN
    RAISE EXCEPTION 'Wave pedigree_public_front_ocr_a evidence promotion postcondition failed';
  END IF;
END
$migration$;
