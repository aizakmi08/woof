-- Promote five exact current Eukanuba package-label versions while retaining
-- every older ingredient version. Two additional Fit Body rows only need an
-- evidence-backed official URL refresh because their ingredients, GTINs, and
-- manufacturer images are byte-for-byte unchanged.
--
-- Safety boundaries:
--   * Every new serving row is staged in catalog_* tables before promotion.
--   * Adult/puppy and breed-size identities stay separate.
--   * Four changed packages have new GTINs and become distinct current source
--     versions; their older web-label versions remain intact.
--   * Puppy Medium Breed reuses GTIN 030111704528 with changed ingredients and
--     image. Both versions stay stored and barcode lookup must abstain.
--   * No retailer sibling evidence is reused or overwritten.

DO $migration$
DECLARE
  v_four_run JSONB :=
    convert_from(decode('eyJydW5fa2V5IjoiZXVrYW51YmE6Ym91bmRlZC1jdXJyZW50LXBhY2thZ2UtdmVyc2lvbnM6MjAyNjA4MDQ6djEtZm91ciIsInNvdXJjZV9zbHVnIjoiZXVrYW51YmEiLCJzb3VyY2VfdHlwZSI6Im1hbnVmYWN0dXJlciIsImNvdmVyYWdlX3JvbGUiOiJ2ZXJpZmljYXRpb24iLCJzdGF0dXMiOiJjb21wbGV0ZWQiLCJzdGFydGVkX2F0IjoiMjAyNi0wNy0yNlQwNjo1NDowOC45ODBaIiwiZXhwZWN0ZWRfY291bnQiOjQsInBhZ2luYXRpb25fY29tcGxldGUiOnRydWUsInRydW5jYXRlZCI6ZmFsc2UsImNhcF9yZWFjaGVkIjpmYWxzZSwic291cmNlX2NvbnRlbnRfaGFzaCI6ImQxYzllYzJlZDc4ZTJhODllZjBmNjkyM2ZmMDExODA1MWVlMWZmZTY4NjAxYjhjMzBlNWE4MTc2OTExODFhYWYiLCJjaGVja3BvaW50Ijp7ImZlZWRfcm93X2NvdW50Ijo0LCJhY2NlcHRlZF9vYnNlcnZhdGlvbl9jb3VudCI6NCwiY2Fub25pY2FsX2Zvcm11bGFfY291bnQiOjR9LCJtZXRhZGF0YSI6eyJicmFuZCI6IkV1a2FudWJhIiwibWFudWZhY3R1cmVyIjoiTWFycyBQZXRjYXJlIiwic291cmNlX2F1dGhvcml0eSI6Im1hbnVmYWN0dXJlciIsImJvdW5kZWRfZXhhY3RfZXZpZGVuY2UiOnRydWUsImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWUsInBhY2thZ2Vfc2l6ZV9pc19za3Vfb25seSI6dHJ1ZSwic2VsZWN0ZWRfY3VycmVudF9wYWNrYWdlX3ZlcnNpb25zIjp0cnVlfX0=', 'base64'), 'UTF8')::JSONB;
  v_four_payload JSONB :=
    convert_from(decode('W3siZm9ybXVsYV9rZXkiOiJtYXJzIHBldGNhcmV8ZXVrYW51YmF8YWR1bHQgc21hbGwgYnJlZWQgZG9nIGZvb2R8ZG9nfGFkdWx0fGRyeXxjaGlja2VufCIsImlkZW50aXR5X2hhc2giOiJhODIyYWQ1M2QzMzRhNzdmNzVkN2Y3MWFlNDJkY2FkZWE2N2ZiZGU1M2EyODgzMjY2ZmMxZjAzZTRmODAwOGJjIiwibWFudWZhY3R1cmVyIjoiTWFycyBQZXRjYXJlIiwiYnJhbmQiOiJFdWthbnViYSIsInByb2R1Y3RfbmFtZSI6IkFkdWx0IFNtYWxsIEJyZWVkIERvZyBGb29kIiwicHJvZHVjdF9saW5lIjoiQURVTFQiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJhZHVsdCIsImZvb2RfZm9ybSI6ImRyeSIsImZsYXZvciI6IkNoaWNrZW4iLCJkaWV0X2NvbmRpdGlvbiI6IiIsInNvdXJjZV9zbHVnIjoiZXVrYW51YmEiLCJzb3VyY2VfZXh0ZXJuYWxfaWQiOiJldWthbnViYTowMzAxMTE4MDQ1MDEiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuZXVrYW51YmEuY29tL3Byb2R1Y3RzL2RyeS9hZHVsdC1zbWFsbC1icmVlZC1kb2ctZm9vZCIsInNvdXJjZV9hdXRob3JpdHkiOiJtYW51ZmFjdHVyZXIiLCJndGluIjoiMDMwMTExODA0NTAxIiwicGFja2FnZV9zaXplIjoiNC41IGxiLCAzNCBsYiwgMTUgbGIiLCJpbmdyZWRpZW50X3RleHQiOiJDaGlja2VuLCBjb3JuLCBjaGlja2VuIGJ5LXByb2R1Y3QgbWVhbCwgc295YmVhbiBtZWFsLCBjaGlja2VuIGZhdCwgZ3JvdW5kIGdyYWluIHNvcmdodW0sIHBvcmsgbWVhbCwgYnJvd24gcmljZSwgZHJpZWQgcGxhaW4gYmVldCBwdWxwLCB3aGVhdCwgbmF0dXJhbCBmbGF2b3JzLCBzYWx0LCBzb2RpdW0gdHJpcG9seXBob3NwaGF0ZSwgY2hvbGluZSBjaGxvcmlkZSwgcm9zZW1hcnkgZXh0cmFjdCwgcHJlc2VydmVkIHdpdGggbWl4ZWQgdG9jb3BoZXJvbHMgYW5kIGNpdHJpYyBhY2lkLCBjYWxjaXVtIGNhcmJvbmF0ZSwgZnJ1Y3Rvb2xpZ29zYWNjaGFyaWRlcywgcG90YXNzaXVtIGNobG9yaWRlLCB2aXRhbWlucyBbREwtYWxwaGEgdG9jb3BoZXJvbCBhY2V0YXRlIChzb3VyY2Ugb2Ygdml0YW1pbiBFKSwgYmlvdGluLCBELWNhbGNpdW0gcGFudG90aGVuYXRlLCB2aXRhbWluIEEgYWNldGF0ZSwgcmlib2ZsYXZpbiBzdXBwbGVtZW50LCBuaWFjaW4gc3VwcGxlbWVudCwgdml0YW1pbiBCMTIgc3VwcGxlbWVudCwgcHlyaWRveGluZSBoeWRyb2NobG9yaWRlICh2aXRhbWluIEI2KSwgdGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpLCB2aXRhbWluIEQzIHN1cHBsZW1lbnQsIGZvbGljIGFjaWRdLCB0cmFjZSBtaW5lcmFscyBbemluYyBveGlkZSwgZmVycm91cyBzdWxmYXRlLCBtYW5nYW5vdXMgb3hpZGUsIGNvcHBlciBzdWxmYXRlLCBzb2RpdW0gc2VsZW5pdGUsIGNhbGNpdW0gaW9kYXRlXSwgZ2x1Y29zYW1pbmUgaHlkcm9jaGxvcmlkZSwgREwtbWV0aGlvbmluZSwgY2hvbmRyb2l0aW4gc3VsZmF0ZS4iLCJpbmdyZWRpZW50cyI6WyJDaGlja2VuIiwiY29ybiIsImNoaWNrZW4gYnktcHJvZHVjdCBtZWFsIiwic295YmVhbiBtZWFsIiwiY2hpY2tlbiBmYXQiLCJncm91bmQgZ3JhaW4gc29yZ2h1bSIsInBvcmsgbWVhbCIsImJyb3duIHJpY2UiLCJkcmllZCBwbGFpbiBiZWV0IHB1bHAiLCJ3aGVhdCIsIm5hdHVyYWwgZmxhdm9ycyIsInNhbHQiLCJzb2RpdW0gdHJpcG9seXBob3NwaGF0ZSIsImNob2xpbmUgY2hsb3JpZGUiLCJyb3NlbWFyeSBleHRyYWN0IiwicHJlc2VydmVkIHdpdGggbWl4ZWQgdG9jb3BoZXJvbHMgYW5kIGNpdHJpYyBhY2lkIiwiY2FsY2l1bSBjYXJib25hdGUiLCJmcnVjdG9vbGlnb3NhY2NoYXJpZGVzIiwicG90YXNzaXVtIGNobG9yaWRlIiwiREwtYWxwaGEgdG9jb3BoZXJvbCBhY2V0YXRlIChzb3VyY2Ugb2Ygdml0YW1pbiBFKSIsImJpb3RpbiIsIkQtY2FsY2l1bSBwYW50b3RoZW5hdGUiLCJ2aXRhbWluIEEgYWNldGF0ZSIsInJpYm9mbGF2aW4gc3VwcGxlbWVudCIsIm5pYWNpbiBzdXBwbGVtZW50Iiwidml0YW1pbiBCMTIgc3VwcGxlbWVudCIsInB5cmlkb3hpbmUgaHlkcm9jaGxvcmlkZSAodml0YW1pbiBCNikiLCJ0aGlhbWluZSBtb25vbml0cmF0ZSAodml0YW1pbiBCMSkiLCJ2aXRhbWluIEQzIHN1cHBsZW1lbnQiLCJmb2xpYyBhY2lkIiwiemluYyBveGlkZSIsImZlcnJvdXMgc3VsZmF0ZSIsIm1hbmdhbm91cyBveGlkZSIsImNvcHBlciBzdWxmYXRlIiwic29kaXVtIHNlbGVuaXRlIiwiY2FsY2l1bSBpb2RhdGUiLCJnbHVjb3NhbWluZSBoeWRyb2NobG9yaWRlIiwiREwtbWV0aGlvbmluZSIsImNob25kcm9pdGluIHN1bGZhdGUiXSwiZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly93d3cuZXVrYW51YmEuY29tL3NpdGVzL2cvZmlsZXMvZm5temRmNTkwNi9maWxlcy9taWdyYXRlLXByb2R1Y3QtZmlsZXMvaW1hZ2VzL2gwZnRmOWtqaXRrdmphaW1weWczLnBuZyIsImlzX2NvbXBsZXRlX2Zvb2QiOnRydWUsImF2YWlsYWJsZV9pbl91cyI6dHJ1ZSwicHJvdGVjdGVkX3Rlcm1zIjpbIkV1a2FudWJhIiwiQURVTFQiLCJDaGlja2VuIiwiZG9nIiwiYWR1bHQiLCJkcnkiXSwib2JzZXJ2ZWRfYXQiOiIyMDI2LTA3LTI2VDA2OjU0OjA4Ljk4MFoiLCJjb250ZW50X2hhc2giOiIxOGVmODY5MWQwNjliNzRjN2Y5YTI3NjU4YjllZjc3NTU4NmVhMDA2MmY4YWVlZDY2OWEyZGUyNWJmZDdjNzYxIiwidmFsaWRhdGlvbl9zdGF0dXMiOiJhY2NlcHRlZCIsInZhbGlkYXRpb25fcmVhc29ucyI6W10sImluZ3JlZGllbnRfdmVyaWZpY2F0aW9uX3N0YXR1cyI6ImxhYmVsX29jcl92ZXJpZmllZCIsImltYWdlX3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJtYW51ZmFjdHVyZXIiLCJjb3ZlcmFnZV90aWVyIjoidGllcl8xX3VzX3JldGFpbCIsInJhd19wYXlsb2FkIjp7ImNhY2hlX2tleSI6ImV1a2FudWJhOjAzMDExMTgwNDUwMSIsImluZ3JlZGllbnRfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LmV1a2FudWJhLmNvbS9wcm9kdWN0cy9kcnkvYWR1bHQtc21hbGwtYnJlZWQtZG9nLWZvb2QiLCJpbWFnZV9zb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuZXVrYW51YmEuY29tL3Byb2R1Y3RzL2RyeS9hZHVsdC1zbWFsbC1icmVlZC1kb2ctZm9vZCIsImNhbm9uaWNhbF9mb3JtdWxhX2lkZW50aXR5Ijp7Im1hbnVmYWN0dXJlciI6Im1hcnMgcGV0Y2FyZSIsImJyYW5kIjoiZXVrYW51YmEiLCJwcm9kdWN0X2xpbmUiOiJhZHVsdCBzbWFsbCBicmVlZCBkb2cgZm9vZCIsInBldF90eXBlIjoiZG9nIiwibGlmZV9zdGFnZSI6ImFkdWx0IiwiZm9vZF9mb3JtIjoiZHJ5IiwiZmxhdm9yIjoiY2hpY2tlbiIsImRpZXRfY29uZGl0aW9uIjoiIn0sImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWUsInBhY2thZ2Vfc2l6ZV9pc19za3Vfb25seSI6dHJ1ZX19LHsiZm9ybXVsYV9rZXkiOiJtYXJzIHBldGNhcmV8ZXVrYW51YmF8ZXVrYW51YmEgYWR1bHQgZHJ5IGRvZyBmb29kIGZvciBtZWRpdW0gZG9nc3xkb2d8YWR1bHR8ZHJ5fHwiLCJpZGVudGl0eV9oYXNoIjoiOTJiNGVlNDFkMzY0YzE0OTZmOTQ3MGVjNDcyYTJiOWI5MGUzMjQ3NzI4ODA0YzQ4ZjliMDNiYWE4NmRiOWM3NCIsIm1hbnVmYWN0dXJlciI6Ik1hcnMgUGV0Y2FyZSIsImJyYW5kIjoiRXVrYW51YmEiLCJwcm9kdWN0X25hbWUiOiJFdWthbnViYSBBZHVsdCBEcnkgRG9nIEZvb2QgZm9yIE1lZGl1bSBEb2dzIiwicHJvZHVjdF9saW5lIjoiQURVTFQiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJhZHVsdCIsImZvb2RfZm9ybSI6ImRyeSIsImZsYXZvciI6IiIsImRpZXRfY29uZGl0aW9uIjoiIiwic291cmNlX3NsdWciOiJldWthbnViYSIsInNvdXJjZV9leHRlcm5hbF9pZCI6ImV1a2FudWJhOjAzMDExMTYwNDUyMSIsInNvdXJjZV91cmwiOiJodHRwczovL3d3dy5ldWthbnViYS5jb20vcHJvZHVjdHMvZHJ5L2V1a2FudWJhLWFkdWx0LWRyeS1kb2ctZm9vZC1tZWRpdW0tZG9ncyIsInNvdXJjZV9hdXRob3JpdHkiOiJtYW51ZmFjdHVyZXIiLCJndGluIjoiMDMwMTExNjA0NTIxIiwicGFja2FnZV9zaXplIjoiNC41IGxiLCAzNSBsYiwgMTUgbGIiLCJpbmdyZWRpZW50X3RleHQiOiJDaGlja2VuLCBjb3JuLCBzb3liZWFuIG1lYWwsIGNoaWNrZW4gZmF0LCBjaGlja2VuIGJ5LXByb2R1Y3QgbWVhbCwgcG9yayBtZWFsLCB3aGVhdCwgYnJvd24gcmljZSwgZ3JvdW5kIGdyYWluIHNvcmdodW0sIGRyaWVkIHBsYWluIGJlZXQgcHVscCwgbmF0dXJhbCBmbGF2b3JzLCBzYWx0LCBzb2RpdW0gdHJpcG9seXBob3NwaGF0ZSwgY2hvbGluZSBjaGxvcmlkZSwgcm9zZW1hcnkgZXh0cmFjdCwgcHJlc2VydmVkIHdpdGggbWl4ZWQgdG9jb3BoZXJvbHMgYW5kIGNpdHJpYyBhY2lkLCBwb3Rhc3NpdW0gY2hsb3JpZGUsIGZydWN0b29saWdvc2FjY2hhcmlkZXMsIERMLW1ldGhpb25pbmUsIG1vbm9jYWxjaXVtIHBob3NwaGF0ZSwgY2FsY2l1bSBjYXJib25hdGUsIHZpdGFtaW5zIFtETC1hbHBoYSB0b2NvcGhlcm9sIGFjZXRhdGUgKHNvdXJjZSBvZiB2aXRhbWluIEUpLCBiaW90aW4sIEQtY2FsY2l1bSBwYW50b3RoZW5hdGUsIHZpdGFtaW4gQSBhY2V0YXRlLCByaWJvZmxhdmluIHN1cHBsZW1lbnQsIG5pYWNpbiBzdXBwbGVtZW50LCB2aXRhbWluIEIxMiBzdXBwbGVtZW50LCBweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpLCB0aGlhbWluZSBtb25vbml0cmF0ZSAodml0YW1pbiBCMSksIHZpdGFtaW4gRDMgc3VwcGxlbWVudCwgZm9saWMgYWNpZF0sIHRyYWNlIG1pbmVyYWxzIFt6aW5jIG94aWRlLCBmZXJyb3VzIHN1bGZhdGUsIG1hbmdhbm91cyBveGlkZSwgY29wcGVyIHN1bGZhdGUsIHNvZGl1bSBzZWxlbml0ZSwgY2FsY2l1bSBpb2RhdGVdLCBnbHVjb3NhbWluZSBoeWRyb2NobG9yaWRlLCBjaG9uZHJvaXRpbiBzdWxmYXRlLiIsImluZ3JlZGllbnRzIjpbIkNoaWNrZW4iLCJjb3JuIiwic295YmVhbiBtZWFsIiwiY2hpY2tlbiBmYXQiLCJjaGlja2VuIGJ5LXByb2R1Y3QgbWVhbCIsInBvcmsgbWVhbCIsIndoZWF0IiwiYnJvd24gcmljZSIsImdyb3VuZCBncmFpbiBzb3JnaHVtIiwiZHJpZWQgcGxhaW4gYmVldCBwdWxwIiwibmF0dXJhbCBmbGF2b3JzIiwic2FsdCIsInNvZGl1bSB0cmlwb2x5cGhvc3BoYXRlIiwiY2hvbGluZSBjaGxvcmlkZSIsInJvc2VtYXJ5IGV4dHJhY3QiLCJwcmVzZXJ2ZWQgd2l0aCBtaXhlZCB0b2NvcGhlcm9scyBhbmQgY2l0cmljIGFjaWQiLCJwb3Rhc3NpdW0gY2hsb3JpZGUiLCJmcnVjdG9vbGlnb3NhY2NoYXJpZGVzIiwiREwtbWV0aGlvbmluZSIsIm1vbm9jYWxjaXVtIHBob3NwaGF0ZSIsImNhbGNpdW0gY2FyYm9uYXRlIiwiREwtYWxwaGEgdG9jb3BoZXJvbCBhY2V0YXRlIChzb3VyY2Ugb2Ygdml0YW1pbiBFKSIsImJpb3RpbiIsIkQtY2FsY2l1bSBwYW50b3RoZW5hdGUiLCJ2aXRhbWluIEEgYWNldGF0ZSIsInJpYm9mbGF2aW4gc3VwcGxlbWVudCIsIm5pYWNpbiBzdXBwbGVtZW50Iiwidml0YW1pbiBCMTIgc3VwcGxlbWVudCIsInB5cmlkb3hpbmUgaHlkcm9jaGxvcmlkZSAodml0YW1pbiBCNikiLCJ0aGlhbWluZSBtb25vbml0cmF0ZSAodml0YW1pbiBCMSkiLCJ2aXRhbWluIEQzIHN1cHBsZW1lbnQiLCJmb2xpYyBhY2lkIiwiemluYyBveGlkZSIsImZlcnJvdXMgc3VsZmF0ZSIsIm1hbmdhbm91cyBveGlkZSIsImNvcHBlciBzdWxmYXRlIiwic29kaXVtIHNlbGVuaXRlIiwiY2FsY2l1bSBpb2RhdGUiLCJnbHVjb3NhbWluZSBoeWRyb2NobG9yaWRlIiwiY2hvbmRyb2l0aW4gc3VsZmF0ZSJdLCJmcm9udF9pbWFnZV91cmwiOiJodHRwczovL3d3dy5ldWthbnViYS5jb20vc2l0ZXMvZy9maWxlcy9mbm16ZGY1OTA2L2ZpbGVzL21pZ3JhdGUtcHJvZHVjdC1maWxlcy9pbWFnZXMveGVjd2dsYWFvdnprZ2xoYndna3MucG5nIiwiaXNfY29tcGxldGVfZm9vZCI6dHJ1ZSwiYXZhaWxhYmxlX2luX3VzIjp0cnVlLCJwcm90ZWN0ZWRfdGVybXMiOlsiRXVrYW51YmEiLCJBRFVMVCIsImRvZyIsImFkdWx0IiwiZHJ5Il0sIm9ic2VydmVkX2F0IjoiMjAyNi0wNy0yNlQwNjo1NDowOC45ODBaIiwiY29udGVudF9oYXNoIjoiNjJkODNmMzUxN2RlYjJkNzU4N2E2MzdjZjExNTA3OGQ1ZjFlMDA0M2NlYmVkMzQzOGZiMTA1MjM3NTZjZTIyMCIsInZhbGlkYXRpb25fc3RhdHVzIjoiYWNjZXB0ZWQiLCJ2YWxpZGF0aW9uX3JlYXNvbnMiOltdLCJpbmdyZWRpZW50X3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJsYWJlbF9vY3JfdmVyaWZpZWQiLCJpbWFnZV92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2VfdGllciI6InRpZXJfMV91c19yZXRhaWwiLCJyYXdfcGF5bG9hZCI6eyJjYWNoZV9rZXkiOiJldWthbnViYTowMzAxMTE2MDQ1MjEiLCJpbmdyZWRpZW50X3NvdXJjZV91cmwiOiJodHRwczovL3d3dy5ldWthbnViYS5jb20vcHJvZHVjdHMvZHJ5L2V1a2FudWJhLWFkdWx0LWRyeS1kb2ctZm9vZC1tZWRpdW0tZG9ncyIsImltYWdlX3NvdXJjZV91cmwiOiJodHRwczovL3d3dy5ldWthbnViYS5jb20vcHJvZHVjdHMvZHJ5L2V1a2FudWJhLWFkdWx0LWRyeS1kb2ctZm9vZC1tZWRpdW0tZG9ncyIsImNhbm9uaWNhbF9mb3JtdWxhX2lkZW50aXR5Ijp7Im1hbnVmYWN0dXJlciI6Im1hcnMgcGV0Y2FyZSIsImJyYW5kIjoiZXVrYW51YmEiLCJwcm9kdWN0X2xpbmUiOiJldWthbnViYSBhZHVsdCBkcnkgZG9nIGZvb2QgZm9yIG1lZGl1bSBkb2dzIiwicGV0X3R5cGUiOiJkb2ciLCJsaWZlX3N0YWdlIjoiYWR1bHQiLCJmb29kX2Zvcm0iOiJkcnkiLCJmbGF2b3IiOiIiLCJkaWV0X2NvbmRpdGlvbiI6IiJ9LCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlLCJwYWNrYWdlX3NpemVfaXNfc2t1X29ubHkiOnRydWV9fSx7ImZvcm11bGFfa2V5IjoibWFycyBwZXRjYXJlfGV1a2FudWJhfHB1cHB5IGxhcmdlIGJyZWVkIGRyeSBkb2cgZm9vZHxkb2d8cHVwcHl8ZHJ5fGNoaWNrZW58IiwiaWRlbnRpdHlfaGFzaCI6IjdjYzI2MzQzNmYyN2NiNmQ4ZGU4MzI4YjE0ODE2MTcyMmE2YjFlZDE0NjhmYWVmMDM1N2QwZmIxNDFkN2QxZjkiLCJtYW51ZmFjdHVyZXIiOiJNYXJzIFBldGNhcmUiLCJicmFuZCI6IkV1a2FudWJhIiwicHJvZHVjdF9uYW1lIjoiUHVwcHkgTGFyZ2UgQnJlZWQgRHJ5IERvZyBGb29kIiwicHJvZHVjdF9saW5lIjoiUFVQUFkiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJwdXBweSIsImZvb2RfZm9ybSI6ImRyeSIsImZsYXZvciI6IkNoaWNrZW4iLCJkaWV0X2NvbmRpdGlvbiI6IiIsInNvdXJjZV9zbHVnIjoiZXVrYW51YmEiLCJzb3VyY2VfZXh0ZXJuYWxfaWQiOiJldWthbnViYTowMzAxMTE2MzkxNDEiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuZXVrYW51YmEuY29tL3Byb2R1Y3RzL2RyeS9wdXBweS1sYXJnZS1icmVlZC1kcnktZG9nLWZvb2QiLCJzb3VyY2VfYXV0aG9yaXR5IjoibWFudWZhY3R1cmVyIiwiZ3RpbiI6IjAzMDExMTYzOTE0MSIsInBhY2thZ2Vfc2l6ZSI6IjE0IGxiLCAzMyBsYiwgNDAgbGIsIDQuNSBsYiIsImluZ3JlZGllbnRfdGV4dCI6IkNoaWNrZW4sIHdoZWF0LCBjaGlja2VuIGJ5LXByb2R1Y3QgbWVhbCwgY29ybiwgc295YmVhbiBtZWFsLCBjaGlja2VuIGZhdCwgYnJld2VycyByaWNlLCBwb3JrIG1lYWwsIGdyb3VuZCBncmFpbiBzb3JnaHVtLCBkcmllZCBwbGFpbiBiZWV0IHB1bHAsIG5hdHVyYWwgZmxhdm9ycywgbW9ub2NhbGNpdW0gcGhvc3BoYXRlLCBzYWx0LCBtYXJpbmUgbWljcm9hbGdhZSBvaWwsIHJvc2VtYXJ5IGV4dHJhY3QsIHByZXNlcnZlZCB3aXRoIG1peGVkIHRvY29waGVyb2xzIGFuZCBjaXRyaWMgYWNpZCwgY2hvbGluZSBjaGxvcmlkZSwgcG90YXNzaXVtIGNobG9yaWRlLCBmcnVjdG9vbGlnb3NhY2NoYXJpZGVzLCBjYWxjaXVtIGNhcmJvbmF0ZSwgdml0YW1pbnMgW0RMLWFscGhhIHRvY29waGVyb2wgYWNldGF0ZSAoc291cmNlIG9mIHZpdGFtaW4gRSksIGJpb3RpbiwgRC1jYWxjaXVtIHBhbnRvdGhlbmF0ZSwgdml0YW1pbiBBIGFjZXRhdGUsIHJpYm9mbGF2aW4gc3VwcGxlbWVudCwgbmlhY2luIHN1cHBsZW1lbnQsIHZpdGFtaW4gQjEyIHN1cHBsZW1lbnQsIHB5cmlkb3hpbmUgaHlkcm9jaGxvcmlkZSAodml0YW1pbiBCNiksIHRoaWFtaW5lIG1vbm9uaXRyYXRlICh2aXRhbWluIEIxKSwgdml0YW1pbiBEMyBzdXBwbGVtZW50LCBmb2xpYyBhY2lkXSwgdHJhY2UgbWluZXJhbHMgW3ppbmMgb3hpZGUsIGZlcnJvdXMgc3VsZmF0ZSwgbWFuZ2Fub3VzIG94aWRlLCBjb3BwZXIgc3VsZmF0ZSwgc29kaXVtIHNlbGVuaXRlLCBjYWxjaXVtIGlvZGF0ZV0uIiwiaW5ncmVkaWVudHMiOlsiQ2hpY2tlbiIsIndoZWF0IiwiY2hpY2tlbiBieS1wcm9kdWN0IG1lYWwiLCJjb3JuIiwic295YmVhbiBtZWFsIiwiY2hpY2tlbiBmYXQiLCJicmV3ZXJzIHJpY2UiLCJwb3JrIG1lYWwiLCJncm91bmQgZ3JhaW4gc29yZ2h1bSIsImRyaWVkIHBsYWluIGJlZXQgcHVscCIsIm5hdHVyYWwgZmxhdm9ycyIsIm1vbm9jYWxjaXVtIHBob3NwaGF0ZSIsInNhbHQiLCJtYXJpbmUgbWljcm9hbGdhZSBvaWwiLCJyb3NlbWFyeSBleHRyYWN0IiwicHJlc2VydmVkIHdpdGggbWl4ZWQgdG9jb3BoZXJvbHMgYW5kIGNpdHJpYyBhY2lkIiwiY2hvbGluZSBjaGxvcmlkZSIsInBvdGFzc2l1bSBjaGxvcmlkZSIsImZydWN0b29saWdvc2FjY2hhcmlkZXMiLCJjYWxjaXVtIGNhcmJvbmF0ZSIsIkRMLWFscGhhIHRvY29waGVyb2wgYWNldGF0ZSAoc291cmNlIG9mIHZpdGFtaW4gRSkiLCJiaW90aW4iLCJELWNhbGNpdW0gcGFudG90aGVuYXRlIiwidml0YW1pbiBBIGFjZXRhdGUiLCJyaWJvZmxhdmluIHN1cHBsZW1lbnQiLCJuaWFjaW4gc3VwcGxlbWVudCIsInZpdGFtaW4gQjEyIHN1cHBsZW1lbnQiLCJweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpIiwidGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpIiwidml0YW1pbiBEMyBzdXBwbGVtZW50IiwiZm9saWMgYWNpZCIsInppbmMgb3hpZGUiLCJmZXJyb3VzIHN1bGZhdGUiLCJtYW5nYW5vdXMgb3hpZGUiLCJjb3BwZXIgc3VsZmF0ZSIsInNvZGl1bSBzZWxlbml0ZSIsImNhbGNpdW0gaW9kYXRlIl0sImZyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LmV1a2FudWJhLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjU5MDYvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy96bG9kdzVwbHF3YmU0b3Q0M2llZy5wbmciLCJpc19jb21wbGV0ZV9mb29kIjp0cnVlLCJhdmFpbGFibGVfaW5fdXMiOnRydWUsInByb3RlY3RlZF90ZXJtcyI6WyJFdWthbnViYSIsIlBVUFBZIiwiQ2hpY2tlbiIsImRvZyIsInB1cHB5IiwiZHJ5Il0sIm9ic2VydmVkX2F0IjoiMjAyNi0wNy0yNlQwNjo1NDowOC45ODBaIiwiY29udGVudF9oYXNoIjoiODAwYTkzYjc0MzI1MTI3NWZiZjdhZGI3MDYxM2U1MzI5MWRhMDZkMWIwNThhN2ViMDdkYjM4OTE4YTliODg4NiIsInZhbGlkYXRpb25fc3RhdHVzIjoiYWNjZXB0ZWQiLCJ2YWxpZGF0aW9uX3JlYXNvbnMiOltdLCJpbmdyZWRpZW50X3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJsYWJlbF9vY3JfdmVyaWZpZWQiLCJpbWFnZV92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2VfdGllciI6InRpZXJfMV91c19yZXRhaWwiLCJyYXdfcGF5bG9hZCI6eyJjYWNoZV9rZXkiOiJldWthbnViYTowMzAxMTE2MzkxNDEiLCJpbmdyZWRpZW50X3NvdXJjZV91cmwiOiJodHRwczovL3d3dy5ldWthbnViYS5jb20vcHJvZHVjdHMvZHJ5L3B1cHB5LWxhcmdlLWJyZWVkLWRyeS1kb2ctZm9vZCIsImltYWdlX3NvdXJjZV91cmwiOiJodHRwczovL3d3dy5ldWthbnViYS5jb20vcHJvZHVjdHMvZHJ5L3B1cHB5LWxhcmdlLWJyZWVkLWRyeS1kb2ctZm9vZCIsImNhbm9uaWNhbF9mb3JtdWxhX2lkZW50aXR5Ijp7Im1hbnVmYWN0dXJlciI6Im1hcnMgcGV0Y2FyZSIsImJyYW5kIjoiZXVrYW51YmEiLCJwcm9kdWN0X2xpbmUiOiJwdXBweSBsYXJnZSBicmVlZCBkcnkgZG9nIGZvb2QiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJwdXBweSIsImZvb2RfZm9ybSI6ImRyeSIsImZsYXZvciI6ImNoaWNrZW4iLCJkaWV0X2NvbmRpdGlvbiI6IiJ9LCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlLCJwYWNrYWdlX3NpemVfaXNfc2t1X29ubHkiOnRydWV9fSx7ImZvcm11bGFfa2V5IjoibWFycyBwZXRjYXJlfGV1a2FudWJhfHB1cHB5IHNtYWxsIGJyZWVkIGRyeSBkb2cgZm9vZHxkb2d8cHVwcHl8ZHJ5fGNoaWNrZW58IiwiaWRlbnRpdHlfaGFzaCI6ImE3NzZhOGY0ZTVhNDQxYTVhZmU5ZGExZGQ3YjZkOGY5M2NiMzllYTViYjg5MGI3NDBlNjFkMGI1ZmIyOTA3OTAiLCJtYW51ZmFjdHVyZXIiOiJNYXJzIFBldGNhcmUiLCJicmFuZCI6IkV1a2FudWJhIiwicHJvZHVjdF9uYW1lIjoiUHVwcHkgU21hbGwgQnJlZWQgRHJ5IERvZyBGb29kIiwicHJvZHVjdF9saW5lIjoiUFVQUFkiLCJwZXRfdHlwZSI6ImRvZyIsImxpZmVfc3RhZ2UiOiJwdXBweSIsImZvb2RfZm9ybSI6ImRyeSIsImZsYXZvciI6IkNoaWNrZW4iLCJkaWV0X2NvbmRpdGlvbiI6IiIsInNvdXJjZV9zbHVnIjoiZXVrYW51YmEiLCJzb3VyY2VfZXh0ZXJuYWxfaWQiOiJldWthbnViYTowMzAxMTE2MzQxNDYiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuZXVrYW51YmEuY29tL3Byb2R1Y3RzL2RyeS9wdXBweS1zbWFsbC1icmVlZC1kcnktZG9nLWZvb2QiLCJzb3VyY2VfYXV0aG9yaXR5IjoibWFudWZhY3R1cmVyIiwiZ3RpbiI6IjAzMDExMTYzNDE0NiIsInBhY2thZ2Vfc2l6ZSI6IjE0IGxiLCAzMiBsYiwgNC41IGxiIiwiaW5ncmVkaWVudF90ZXh0IjoiQ2hpY2tlbiwgY2hpY2tlbiBieS1wcm9kdWN0IG1lYWwsIGNoaWNrZW4gZmF0LCBjb3JuLCBzb3liZWFuIG1lYWwsIHBvcmsgbWVhbCwgYnJld2VycyByaWNlLCBncm91bmQgZ3JhaW4gc29yZ2h1bSwgd2hlYXQsIGRyaWVkIHBsYWluIGJlZXQgcHVscCwgbmF0dXJhbCBmbGF2b3JzLCBtb25vY2FsY2l1bSBwaG9zcGhhdGUsIHNhbHQsIG1hcmluZSBtaWNyb2FsZ2FlIG9pbCwgcm9zZW1hcnkgZXh0cmFjdCwgcHJlc2VydmVkIHdpdGggbWl4ZWQgdG9jb3BoZXJvbHMgYW5kIGNpdHJpYyBhY2lkLCBmcnVjdG9vbGlnb3NhY2NoYXJpZGVzLCBjaG9saW5lIGNobG9yaWRlLCBwb3Rhc3NpdW0gY2hsb3JpZGUsIHZpdGFtaW5zIFtETC1hbHBoYSB0b2NvcGhlcm9sIGFjZXRhdGUgKHNvdXJjZSBvZiB2aXRhbWluIEUpLCBiaW90aW4sIEQtY2FsY2l1bSBwYW50b3RoZW5hdGUsIHZpdGFtaW4gQSBhY2V0YXRlLCByaWJvZmxhdmluIHN1cHBsZW1lbnQsIG5pYWNpbiBzdXBwbGVtZW50LCB2aXRhbWluIEIxMiBzdXBwbGVtZW50LCBweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpLCB0aGlhbWluZSBtb25vbml0cmF0ZSAodml0YW1pbiBCMSksIHZpdGFtaW4gRDMgc3VwcGxlbWVudCwgZm9saWMgYWNpZF0sIHRyYWNlIG1pbmVyYWxzIFt6aW5jIG94aWRlLCBmZXJyb3VzIHN1bGZhdGUsIG1hbmdhbm91cyBveGlkZSwgY29wcGVyIHN1bGZhdGUsIHNvZGl1bSBzZWxlbml0ZSwgY2FsY2l1bSBpb2RhdGVdLiIsImluZ3JlZGllbnRzIjpbIkNoaWNrZW4iLCJjaGlja2VuIGJ5LXByb2R1Y3QgbWVhbCIsImNoaWNrZW4gZmF0IiwiY29ybiIsInNveWJlYW4gbWVhbCIsInBvcmsgbWVhbCIsImJyZXdlcnMgcmljZSIsImdyb3VuZCBncmFpbiBzb3JnaHVtIiwid2hlYXQiLCJkcmllZCBwbGFpbiBiZWV0IHB1bHAiLCJuYXR1cmFsIGZsYXZvcnMiLCJtb25vY2FsY2l1bSBwaG9zcGhhdGUiLCJzYWx0IiwibWFyaW5lIG1pY3JvYWxnYWUgb2lsIiwicm9zZW1hcnkgZXh0cmFjdCIsInByZXNlcnZlZCB3aXRoIG1peGVkIHRvY29waGVyb2xzIGFuZCBjaXRyaWMgYWNpZCIsImZydWN0b29saWdvc2FjY2hhcmlkZXMiLCJjaG9saW5lIGNobG9yaWRlIiwicG90YXNzaXVtIGNobG9yaWRlIiwiREwtYWxwaGEgdG9jb3BoZXJvbCBhY2V0YXRlIChzb3VyY2Ugb2Ygdml0YW1pbiBFKSIsImJpb3RpbiIsIkQtY2FsY2l1bSBwYW50b3RoZW5hdGUiLCJ2aXRhbWluIEEgYWNldGF0ZSIsInJpYm9mbGF2aW4gc3VwcGxlbWVudCIsIm5pYWNpbiBzdXBwbGVtZW50Iiwidml0YW1pbiBCMTIgc3VwcGxlbWVudCIsInB5cmlkb3hpbmUgaHlkcm9jaGxvcmlkZSAodml0YW1pbiBCNikiLCJ0aGlhbWluZSBtb25vbml0cmF0ZSAodml0YW1pbiBCMSkiLCJ2aXRhbWluIEQzIHN1cHBsZW1lbnQiLCJmb2xpYyBhY2lkIiwiemluYyBveGlkZSIsImZlcnJvdXMgc3VsZmF0ZSIsIm1hbmdhbm91cyBveGlkZSIsImNvcHBlciBzdWxmYXRlIiwic29kaXVtIHNlbGVuaXRlIiwiY2FsY2l1bSBpb2RhdGUiXSwiZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly93d3cuZXVrYW51YmEuY29tL3NpdGVzL2cvZmlsZXMvZm5temRmNTkwNi9maWxlcy9taWdyYXRlLXByb2R1Y3QtZmlsZXMvaW1hZ2VzL3B5aGVrdGpzNmphZm5kd2pndG12LnBuZyIsImlzX2NvbXBsZXRlX2Zvb2QiOnRydWUsImF2YWlsYWJsZV9pbl91cyI6dHJ1ZSwicHJvdGVjdGVkX3Rlcm1zIjpbIkV1a2FudWJhIiwiUFVQUFkiLCJDaGlja2VuIiwiZG9nIiwicHVwcHkiLCJkcnkiXSwib2JzZXJ2ZWRfYXQiOiIyMDI2LTA3LTI2VDA2OjU0OjA4Ljk4MFoiLCJjb250ZW50X2hhc2giOiIyYjg3ZmYwNTdlOTA5N2U2YzdlOGZlZjNiNWQ5NDM4MjBkMzc5YTI0ZTU0MTYxNmY5MjBkYjRiOWYxNWY3NzU2IiwidmFsaWRhdGlvbl9zdGF0dXMiOiJhY2NlcHRlZCIsInZhbGlkYXRpb25fcmVhc29ucyI6W10sImluZ3JlZGllbnRfdmVyaWZpY2F0aW9uX3N0YXR1cyI6ImxhYmVsX29jcl92ZXJpZmllZCIsImltYWdlX3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJtYW51ZmFjdHVyZXIiLCJjb3ZlcmFnZV90aWVyIjoidGllcl8xX3VzX3JldGFpbCIsInJhd19wYXlsb2FkIjp7ImNhY2hlX2tleSI6ImV1a2FudWJhOjAzMDExMTYzNDE0NiIsImluZ3JlZGllbnRfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LmV1a2FudWJhLmNvbS9wcm9kdWN0cy9kcnkvcHVwcHktc21hbGwtYnJlZWQtZHJ5LWRvZy1mb29kIiwiaW1hZ2Vfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LmV1a2FudWJhLmNvbS9wcm9kdWN0cy9kcnkvcHVwcHktc21hbGwtYnJlZWQtZHJ5LWRvZy1mb29kIiwiY2Fub25pY2FsX2Zvcm11bGFfaWRlbnRpdHkiOnsibWFudWZhY3R1cmVyIjoibWFycyBwZXRjYXJlIiwiYnJhbmQiOiJldWthbnViYSIsInByb2R1Y3RfbGluZSI6InB1cHB5IHNtYWxsIGJyZWVkIGRyeSBkb2cgZm9vZCIsInBldF90eXBlIjoiZG9nIiwibGlmZV9zdGFnZSI6InB1cHB5IiwiZm9vZF9mb3JtIjoiZHJ5IiwiZmxhdm9yIjoiY2hpY2tlbiIsImRpZXRfY29uZGl0aW9uIjoiIn0sImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWUsInBhY2thZ2Vfc2l6ZV9pc19za3Vfb25seSI6dHJ1ZX19XQ==', 'base64'), 'UTF8')::JSONB;
  v_puppy_run JSONB :=
    convert_from(decode('eyJydW5fa2V5IjoiZXVrYW51YmE6Ym91bmRlZC1jdXJyZW50LXBhY2thZ2UtdmVyc2lvbjpwdXBweS1tZWRpdW06MjAyNjA4MDQ6djIiLCJzb3VyY2Vfc2x1ZyI6ImV1a2FudWJhIiwic291cmNlX3R5cGUiOiJtYW51ZmFjdHVyZXIiLCJjb3ZlcmFnZV9yb2xlIjoidmVyaWZpY2F0aW9uIiwic3RhdHVzIjoiY29tcGxldGVkIiwic3RhcnRlZF9hdCI6IjIwMjYtMDctMjZUMDY6NTQ6MDguOTgwWiIsImV4cGVjdGVkX2NvdW50IjoxLCJwYWdpbmF0aW9uX2NvbXBsZXRlIjp0cnVlLCJ0cnVuY2F0ZWQiOmZhbHNlLCJjYXBfcmVhY2hlZCI6ZmFsc2UsInNvdXJjZV9jb250ZW50X2hhc2giOiJiZTNlYTA0MjkxMDMyZDRjMDBjMDAwNWZmOGZmODgxOGRhY2M2M2JjMzEzNGMyMDE4MTJlNzQ4ZjM4OTIzYTY5IiwiY2hlY2twb2ludCI6eyJmZWVkX3Jvd19jb3VudCI6MSwiYWNjZXB0ZWRfb2JzZXJ2YXRpb25fY291bnQiOjEsImNhbm9uaWNhbF9mb3JtdWxhX2NvdW50IjoxfSwibWV0YWRhdGEiOnsiYnJhbmQiOiJFdWthbnViYSIsIm1hbnVmYWN0dXJlciI6Ik1hcnMgUGV0Y2FyZSIsInNvdXJjZV9hdXRob3JpdHkiOiJtYW51ZmFjdHVyZXIiLCJib3VuZGVkX2V4YWN0X2V2aWRlbmNlIjp0cnVlLCJleGFjdF9mb3JtdWxhX2V2aWRlbmNlIjp0cnVlLCJwYWNrYWdlX3NpemVfaXNfc2t1X29ubHkiOnRydWUsInNlbGVjdGVkX2N1cnJlbnRfcGFja2FnZV92ZXJzaW9ucyI6dHJ1ZSwicmV1c2VkX2d0aW5fY3VycmVudF92ZXJzaW9uIjp0cnVlfX0=', 'base64'), 'UTF8')::JSONB;
  v_puppy_payload JSONB :=
    convert_from(decode('W3siZm9ybXVsYV9rZXkiOiJtYXJzIHBldGNhcmV8ZXVrYW51YmF8cHVwcHkgbWVkaXVtIGJyZWVkIGRyeSBkb2cgZm9vZHxkb2d8cHVwcHl8ZHJ5fGNoaWNrZW58IiwiaWRlbnRpdHlfaGFzaCI6ImUzNDA4NTBmNzQ1NDMyOTM5YTdmODY2MGQyM2VjZjQyOTcxOTE4Mzk0YWViMmY0MDgxODMyZGIzYzM3MzU0ZmMiLCJtYW51ZmFjdHVyZXIiOiJNYXJzIFBldGNhcmUiLCJicmFuZCI6IkV1a2FudWJhIiwicHJvZHVjdF9uYW1lIjoiUHVwcHkgTWVkaXVtIEJyZWVkIERyeSBEb2cgRm9vZCIsInByb2R1Y3RfbGluZSI6IlBVUFBZIiwicGV0X3R5cGUiOiJkb2ciLCJsaWZlX3N0YWdlIjoicHVwcHkiLCJmb29kX2Zvcm0iOiJkcnkiLCJmbGF2b3IiOiJDaGlja2VuIiwiZGlldF9jb25kaXRpb24iOiIiLCJzb3VyY2Vfc2x1ZyI6ImV1a2FudWJhIiwic291cmNlX2V4dGVybmFsX2lkIjoiZXVrYW51YmEtY3VycmVudDowMzAxMTE3MDQ1Mjg6MjAyNjA3MjYiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly93d3cuZXVrYW51YmEuY29tL3Byb2R1Y3RzL2RyeS9wdXBweS1tZWRpdW0tYnJlZWQtZHJ5LWRvZy1mb29kIiwic291cmNlX2F1dGhvcml0eSI6Im1hbnVmYWN0dXJlciIsImd0aW4iOiIiLCJwYWNrYWdlX3NpemUiOiI0LjUgbGIsIDMzIGxiLCAxNCBsYiIsImluZ3JlZGllbnRfdGV4dCI6IkNoaWNrZW4sIGNoaWNrZW4gYnktcHJvZHVjdCBtZWFsLCBjb3JuLCBjaGlja2VuIGZhdCwgd2hlYXQsIHNveWJlYW4gbWVhbCwgcG9yayBtZWFsLCBncm91bmQgZ3JhaW4gc29yZ2h1bSwgYnJld2VycyByaWNlLCBkcmllZCBwbGFpbiBiZWV0IHB1bHAsIG5hdHVyYWwgZmxhdm9ycywgbW9ub2NhbGNpdW0gcGhvc3BoYXRlLCBzYWx0LCBtYXJpbmUgbWljcm9hbGdhZSBvaWwsIHJvc2VtYXJ5IGV4dHJhY3QsIHByZXNlcnZlZCB3aXRoIG1peGVkIHRvY29waGVyb2xzIGFuZCBjaXRyaWMgYWNpZCwgZnJ1Y3Rvb2xpZ29zYWNjaGFyaWRlcywgY2hvbGluZSBjaGxvcmlkZSwgcG90YXNzaXVtIGNobG9yaWRlLCB2aXRhbWlucyBbREwtYWxwaGEgdG9jb3BoZXJvbCBhY2V0YXRlIChzb3VyY2Ugb2Ygdml0YW1pbiBFKSwgYmlvdGluLCBELWNhbGNpdW0gcGFudG90aGVuYXRlLCB2aXRhbWluIEEgYWNldGF0ZSwgcmlib2ZsYXZpbiBzdXBwbGVtZW50LCBuaWFjaW4gc3VwcGxlbWVudCwgdml0YW1pbiBCMTIgc3VwcGxlbWVudCwgcHlyaWRveGluZSBoeWRyb2NobG9yaWRlICh2aXRhbWluIEI2KSwgdGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpLCB2aXRhbWluIEQzIHN1cHBsZW1lbnQsIGZvbGljIGFjaWRdLCB0cmFjZSBtaW5lcmFscyBbemluYyBveGlkZSwgZmVycm91cyBzdWxmYXRlLCBtYW5nYW5vdXMgb3hpZGUsIGNvcHBlciBzdWxmYXRlLCBzb2RpdW0gc2VsZW5pdGUsIGNhbGNpdW0gaW9kYXRlXS4iLCJpbmdyZWRpZW50cyI6WyJDaGlja2VuIiwiY2hpY2tlbiBieS1wcm9kdWN0IG1lYWwiLCJjb3JuIiwiY2hpY2tlbiBmYXQiLCJ3aGVhdCIsInNveWJlYW4gbWVhbCIsInBvcmsgbWVhbCIsImdyb3VuZCBncmFpbiBzb3JnaHVtIiwiYnJld2VycyByaWNlIiwiZHJpZWQgcGxhaW4gYmVldCBwdWxwIiwibmF0dXJhbCBmbGF2b3JzIiwibW9ub2NhbGNpdW0gcGhvc3BoYXRlIiwic2FsdCIsIm1hcmluZSBtaWNyb2FsZ2FlIG9pbCIsInJvc2VtYXJ5IGV4dHJhY3QiLCJwcmVzZXJ2ZWQgd2l0aCBtaXhlZCB0b2NvcGhlcm9scyBhbmQgY2l0cmljIGFjaWQiLCJmcnVjdG9vbGlnb3NhY2NoYXJpZGVzIiwiY2hvbGluZSBjaGxvcmlkZSIsInBvdGFzc2l1bSBjaGxvcmlkZSIsIkRMLWFscGhhIHRvY29waGVyb2wgYWNldGF0ZSAoc291cmNlIG9mIHZpdGFtaW4gRSkiLCJiaW90aW4iLCJELWNhbGNpdW0gcGFudG90aGVuYXRlIiwidml0YW1pbiBBIGFjZXRhdGUiLCJyaWJvZmxhdmluIHN1cHBsZW1lbnQiLCJuaWFjaW4gc3VwcGxlbWVudCIsInZpdGFtaW4gQjEyIHN1cHBsZW1lbnQiLCJweXJpZG94aW5lIGh5ZHJvY2hsb3JpZGUgKHZpdGFtaW4gQjYpIiwidGhpYW1pbmUgbW9ub25pdHJhdGUgKHZpdGFtaW4gQjEpIiwidml0YW1pbiBEMyBzdXBwbGVtZW50IiwiZm9saWMgYWNpZCIsInppbmMgb3hpZGUiLCJmZXJyb3VzIHN1bGZhdGUiLCJtYW5nYW5vdXMgb3hpZGUiLCJjb3BwZXIgc3VsZmF0ZSIsInNvZGl1bSBzZWxlbml0ZSIsImNhbGNpdW0gaW9kYXRlIl0sImZyb250X2ltYWdlX3VybCI6Imh0dHBzOi8vd3d3LmV1a2FudWJhLmNvbS9zaXRlcy9nL2ZpbGVzL2ZubXpkZjU5MDYvZmlsZXMvbWlncmF0ZS1wcm9kdWN0LWZpbGVzL2ltYWdlcy95a25saHN4dzB3b3poN3c4YjRzdS5wbmciLCJpc19jb21wbGV0ZV9mb29kIjp0cnVlLCJhdmFpbGFibGVfaW5fdXMiOnRydWUsInByb3RlY3RlZF90ZXJtcyI6WyJFdWthbnViYSIsIlBVUFBZIiwiQ2hpY2tlbiIsImRvZyIsInB1cHB5IiwiZHJ5Il0sIm9ic2VydmVkX2F0IjoiMjAyNi0wNy0yNlQwNjo1NDowOC45ODBaIiwiY29udGVudF9oYXNoIjoiMzFlNmUxOGMwMmM2YWI0MGRjN2I4YTk1MzA5MjQ0MDg3MGVjMzFmMmY4NmVmNTNlM2Q3MjI2NGJmOGM4Mzk0MCIsInZhbGlkYXRpb25fc3RhdHVzIjoiYWNjZXB0ZWQiLCJ2YWxpZGF0aW9uX3JlYXNvbnMiOltdLCJpbmdyZWRpZW50X3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJsYWJlbF9vY3JfdmVyaWZpZWQiLCJpbWFnZV92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2VfdGllciI6InRpZXJfMV91c19yZXRhaWwiLCJyYXdfcGF5bG9hZCI6eyJjYWNoZV9rZXkiOiJldWthbnViYS1jdXJyZW50OjAzMDExMTcwNDUyODoyMDI2MDcyNiIsImluZ3JlZGllbnRfc291cmNlX3VybCI6Imh0dHBzOi8vd3d3LmV1a2FudWJhLmNvbS9wcm9kdWN0cy9kcnkvcHVwcHktbWVkaXVtLWJyZWVkLWRyeS1kb2ctZm9vZCIsImltYWdlX3NvdXJjZV91cmwiOiJodHRwczovL3d3dy5ldWthbnViYS5jb20vcHJvZHVjdHMvZHJ5L3B1cHB5LW1lZGl1bS1icmVlZC1kcnktZG9nLWZvb2QiLCJjYW5vbmljYWxfZm9ybXVsYV9pZGVudGl0eSI6eyJtYW51ZmFjdHVyZXIiOiJtYXJzIHBldGNhcmUiLCJicmFuZCI6ImV1a2FudWJhIiwicHJvZHVjdF9saW5lIjoicHVwcHkgbWVkaXVtIGJyZWVkIGRyeSBkb2cgZm9vZCIsInBldF90eXBlIjoiZG9nIiwibGlmZV9zdGFnZSI6InB1cHB5IiwiZm9vZF9mb3JtIjoiZHJ5IiwiZmxhdm9yIjoiY2hpY2tlbiIsImRpZXRfY29uZGl0aW9uIjoiIn0sImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWUsInBhY2thZ2Vfc2l6ZV9pc19za3Vfb25seSI6dHJ1ZSwicGFja2FnZV9ndGluIjoiMDMwMTExNzA0NTI4IiwicmV1c2VkX2d0aW5fY3VycmVudF92ZXJzaW9uIjp0cnVlfX1d', 'base64'), 'UTF8')::JSONB;
  v_formula_id BIGINT;
  v_puppy_formula_id BIGINT;
  v_observation_id BIGINT;
  v_puppy_cache CONSTANT TEXT :=
    'eukanuba-current:030111704528:20260726';
  v_puppy_key CONSTANT TEXT :=
    'mars petcare|eukanuba|puppy medium breed dry dog food|dog|puppy|dry|chicken|';
  v_puppy_url CONSTANT TEXT :=
    'https://www.eukanuba.com/products/dry/puppy-medium-breed-dry-dog-food';
  v_puppy_hash CONSTANT TEXT :=
    '6d58a5a4bf1e6b4d192751e70f1fa2f2a442ffa525a333f582dc51dbadb073dd';
  v_puppy_image CONSTANT TEXT :=
    'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/yknlhsxw0wozh7w8b4su.png';
BEGIN
  -- Existing exact versions and older version evidence must still match the
  -- reviewed production state before any row is staged.
  IF (
    SELECT count(*)
    FROM public.product_data serving
    JOIN (
      VALUES
        (
          'eukanuba:030111301055',
          '030111301055',
          '4651fe950de3aca7a1580647fef630d1',
          'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/39cb88d65d41656657c7c073fa3ad23929c4b332.png',
          'https://www.eukanuba.com/products/adult-dog-food/fit-body-weight-control-large-breed-dry-dog-food'
        ),
        (
          'eukanuba:030111151018',
          '030111151018',
          '5a714a330b9605a358d964e03256b799',
          'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/b979298c4264eb5593b12cfdad2a29f32b069cc6.png',
          'https://www.eukanuba.com/products/adult-dog-food/fit-body-weight-control-medium-breed-dry-dog-food'
        )
    ) expected(cache_key, gtin, ingredient_md5, image_url, old_url)
      ON expected.cache_key = serving.cache_key
     AND expected.gtin = serving.gtin
     AND expected.ingredient_md5 = md5(serving.ingredient_text)
     AND expected.image_url = serving.image_url
     AND expected.old_url = serving.source_url
    WHERE serving.formula_evidence_tier = 'web_label_version'
      AND serving.ingredient_verification_status = 'label_ocr_verified'
      AND serving.image_verification_status = 'manufacturer'
  ) <> 2 THEN
    RAISE EXCEPTION 'Eukanuba Fit Body exact URL-refresh preconditions changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data serving
    JOIN (
      VALUES
        ('eukanuba:030111280114', 'a189180399846ea6fdc3060404ef1e2a'),
        ('eukanuba:030111160027', 'ab77a7959cd184c991f09830f70d1cfc'),
        ('eukanuba:030111302076', 'daa540e99ea44a4c0c0230a327619411'),
        ('eukanuba:030111704528', 'a56d83e859c2767bc80ac213cbb0cf7a'),
        ('eukanuba:030111150066', '9e1f80a45c1727260bb8518b3e3ac33c')
    ) expected(cache_key, ingredient_md5)
      ON expected.cache_key = serving.cache_key
     AND expected.ingredient_md5 = md5(serving.ingredient_text)
    WHERE serving.formula_evidence_tier = 'web_label_version'
      AND serving.ingredient_verification_status = 'label_ocr_verified'
      AND serving.image_verification_status = 'manufacturer'
  ) <> 5 THEN
    RAISE EXCEPTION 'Eukanuba retained-version preconditions changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key IN (
      'mars petcare|eukanuba|adult small breed dog food|dog|adult|dry|chicken|',
      'mars petcare|eukanuba|eukanuba adult dry dog food for medium dogs|dog|adult|dry||',
      'mars petcare|eukanuba|puppy large breed dry dog food|dog|puppy|dry|chicken|',
      'mars petcare|eukanuba|puppy medium breed dry dog food|dog|puppy|dry|chicken|',
      'mars petcare|eukanuba|puppy small breed dry dog food|dog|puppy|dry|chicken|'
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key IN (
      'eukanuba:030111804501',
      'eukanuba:030111604521',
      'eukanuba:030111639141',
      v_puppy_cache,
      'eukanuba:030111634146'
    )
  ) THEN
    RAISE EXCEPTION 'Eukanuba current package versions already exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 32034
      AND formula_key =
        'eukanuba|eukanuba|puppy medium breed dry dog food|dog|puppy|dry|chicken|'
      AND active
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND promoted_cache_key = 'eukanuba:030111704528'
      AND md5(ingredient_text) = 'a56d83e859c2767bc80ac213cbb0cf7a'
  ) THEN
    RAISE EXCEPTION 'Eukanuba old Puppy Medium formula precondition changed';
  END IF;

  -- The two Fit Body packages are unchanged; refresh only their canonical
  -- serving URL and preserve the former URL in provenance.
  UPDATE public.product_data serving
  SET source_url = target.current_url,
      scraped_at = target.observed_at,
      verified_at = target.observed_at,
      expires_at = target.observed_at + INTERVAL '365 days',
      formula_version_provenance =
        COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'previous_source_url', target.previous_url,
          'current_source_url', target.current_url,
          'source_url_redirect_verified', TRUE,
          'current_official_page_observed_at', target.observed_at,
          'current_official_ingredient_text_hash', target.ingredient_sha256,
          'current_official_front_image_url', target.image_url
        ),
      updated_at = NOW()
  FROM (
    VALUES
      (
        'eukanuba:030111301055',
        'https://www.eukanuba.com/products/adult-dog-food/fit-body-weight-control-large-breed-dry-dog-food',
        'https://www.eukanuba.com/products/dry/fit-body-weight-control-large-breed-dry-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        'aab36de11fcdf74fc54e647bc43a96b57b1a874a34c0ea7ef212dcd05870f1b7',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/39cb88d65d41656657c7c073fa3ad23929c4b332.png'
      ),
      (
        'eukanuba:030111151018',
        'https://www.eukanuba.com/products/adult-dog-food/fit-body-weight-control-medium-breed-dry-dog-food',
        'https://www.eukanuba.com/products/dry/fit-body-weight-control-medium-breed-dry-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        '126f5f25b9afa4d541a0a1fc2b0ea6fddf31a1f8a464edf106b59a6ecbca6ac7',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/b979298c4264eb5593b12cfdad2a29f32b069cc6.png'
      )
  ) target(
    cache_key, previous_url, current_url, observed_at,
    ingredient_sha256, image_url
  )
  WHERE serving.cache_key = target.cache_key
    AND serving.source_url = target.previous_url
    AND encode(digest(serving.ingredient_text, 'sha256'), 'hex') =
      target.ingredient_sha256
    AND serving.image_url = target.image_url;

  -- Stage four current official packages whose GTINs are new.
  PERFORM public.stage_catalog_census_batch(v_four_run, v_four_payload);

  -- Stage Puppy Medium without claiming its reused GTIN yet. The serving
  -- version is promoted first; only then can the guarded SKU record the
  -- explicit abstention policy for the version conflict.
  PERFORM public.stage_catalog_census_batch(v_puppy_run, v_puppy_payload);

  UPDATE public.catalog_formulas formula
  SET complete_food_evidence =
        'Exact current Eukanuba official package page with full reviewed label ingredient statement and matching manufacturer front image.',
      formula_evidence_tier = 'web_label_version',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'source_versioned',
        'current_official_package_page', TRUE,
        'source', 'eukanuba',
        'source_url', target.source_url,
        'captured_at', target.observed_at,
        'package_gtin', target.gtin,
        'package_size', target.package_size,
        'ingredient_text_hash', target.ingredient_sha256,
        'front_image_url', target.image_url,
        'evidence_method',
          'official_package_label_ocr_structurally_reviewed',
        'previous_version_retained', TRUE,
        'allow_reused_gtin_version', target.reused_gtin,
        'gtin_resolution_policy',
          CASE
            WHEN target.reused_gtin
              THEN 'abstain_on_version_conflict'
            ELSE 'exact_current_package'
          END
      ),
      verification_status = 'verified',
      active = TRUE,
      is_popular_brand = TRUE,
      updated_at = NOW()
  FROM (
    VALUES
      (
        'mars petcare|eukanuba|adult small breed dog food|dog|adult|dry|chicken|',
        '030111804501',
        '4.5 lb, 34 lb, 15 lb',
        'https://www.eukanuba.com/products/dry/adult-small-breed-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        'fe65a3bbe74a7aade415a6674540bd262bf11bc35904d7be24689d606307d0a1',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/h0ftf9kjitkvjaimpyg3.png',
        FALSE
      ),
      (
        'mars petcare|eukanuba|eukanuba adult dry dog food for medium dogs|dog|adult|dry||',
        '030111604521',
        '4.5 lb, 35 lb, 15 lb',
        'https://www.eukanuba.com/products/dry/eukanuba-adult-dry-dog-food-medium-dogs',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        '15d9c0c4a6a2a6eab9504ccfbd9af0af4115964e10bc57d6005b74ef3e187738',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/xecwglaaovzkglhbwgks.png',
        FALSE
      ),
      (
        'mars petcare|eukanuba|puppy large breed dry dog food|dog|puppy|dry|chicken|',
        '030111639141',
        '14 lb, 33 lb, 40 lb, 4.5 lb',
        'https://www.eukanuba.com/products/dry/puppy-large-breed-dry-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        '0e84bc01aa91f1a2486e21dfb37edf86a47db5a479bed5f0f39705f77e831f3d',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/zlodw5plqwbe4ot43ieg.png',
        FALSE
      ),
      (
        v_puppy_key,
        '030111704528',
        '4.5 lb, 33 lb, 14 lb',
        v_puppy_url,
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        v_puppy_hash,
        v_puppy_image,
        TRUE
      ),
      (
        'mars petcare|eukanuba|puppy small breed dry dog food|dog|puppy|dry|chicken|',
        '030111634146',
        '14 lb, 32 lb, 4.5 lb',
        'https://www.eukanuba.com/products/dry/puppy-small-breed-dry-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        '7c5db90133f6ef5e4d743ec2424f9d5eb410aa1dd722b5e03ae7c699b1ba39c6',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/pyhektjs6jafndwjgtmv.png',
        FALSE
      )
  ) target(
    formula_key, gtin, package_size, source_url, observed_at,
    ingredient_sha256, image_url, reused_gtin
  )
  WHERE formula.formula_key = target.formula_key
    AND encode(digest(formula.ingredient_text, 'sha256'), 'hex') =
      target.ingredient_sha256
    AND formula.front_image_url = target.image_url;

  UPDATE public.catalog_observations observation
  SET formula_evidence_tier = 'web_label_version',
      formula_version_provenance = formula.formula_version_provenance
  FROM public.catalog_formulas formula
  WHERE observation.formula_id = formula.id
    AND observation.run_id IN (
      SELECT id
      FROM public.catalog_source_runs
      WHERE run_key IN (
        'eukanuba:bounded-current-package-versions:20260804:v1-four',
        'eukanuba:bounded-current-package-version:puppy-medium:20260804:v2'
      )
    );

  -- The older Puppy Medium page was incorrectly labeled current. Retain it as
  -- a historical web-label source version and make the shared-GTIN conflict
  -- explicit on both versions.
  UPDATE public.catalog_formulas
  SET formula_evidence_tier = 'web_label_version',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'historical_web_label_version',
          'superseded_by_cache_key', v_puppy_cache,
          'shared_gtin_version_conflict', TRUE,
          'gtin_resolution_policy', 'abstain_on_version_conflict'
        ),
      updated_at = NOW()
  WHERE id = 32034;

  UPDATE public.product_data
  SET formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'historical_web_label_version',
          'superseded_by_cache_key', v_puppy_cache,
          'shared_gtin_version_conflict', TRUE,
          'gtin_resolution_policy', 'abstain_on_version_conflict'
        ),
      updated_at = NOW()
  WHERE cache_key = 'eukanuba:030111704528'
    AND md5(ingredient_text) = 'a56d83e859c2767bc80ac213cbb0cf7a';

  FOR v_formula_id IN
    SELECT id
    FROM public.catalog_formulas
    WHERE formula_key IN (
      'mars petcare|eukanuba|adult small breed dog food|dog|adult|dry|chicken|',
      'mars petcare|eukanuba|eukanuba adult dry dog food for medium dogs|dog|adult|dry||',
      'mars petcare|eukanuba|puppy large breed dry dog food|dog|puppy|dry|chicken|',
      v_puppy_key,
      'mars petcare|eukanuba|puppy small breed dry dog food|dog|puppy|dry|chicken|'
    )
    ORDER BY id
  LOOP
    PERFORM *
    FROM public.promote_catalog_formula_without_exact_evidence_reuse(
      v_formula_id
    );
  END LOOP;

  SELECT id
  INTO STRICT v_puppy_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_puppy_key
    AND promoted_cache_key = v_puppy_cache
    AND md5(ingredient_text) = '0882f4ca1aab3e7bea960b749c1418df';

  UPDATE public.product_data
  SET gtin = '030111704528',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'package_gtin', '030111704528',
          'allow_reused_gtin_version', TRUE,
          'shared_gtin_version_conflict', TRUE,
          'gtin_resolution_policy', 'abstain_on_version_conflict'
        ),
      updated_at = NOW()
  WHERE cache_key = v_puppy_cache
    AND source_url = v_puppy_url
    AND encode(digest(ingredient_text, 'sha256'), 'hex') = v_puppy_hash
    AND image_url = v_puppy_image;

  UPDATE public.catalog_observations observation
  SET gtin = '030111704528',
      formula_version_provenance =
        COALESCE(observation.formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'package_gtin', '030111704528',
          'allow_reused_gtin_version', TRUE,
          'shared_gtin_version_conflict', TRUE,
          'gtin_resolution_policy', 'abstain_on_version_conflict'
        )
  WHERE observation.formula_id = v_puppy_formula_id
    AND observation.source_url = v_puppy_url
    AND md5(observation.ingredient_text) =
      '0882f4ca1aab3e7bea960b749c1418df';

  INSERT INTO public.catalog_skus (
    formula_id,
    gtin,
    package_size,
    package_count,
    source_slug,
    source_external_id,
    source_url,
    active,
    first_observed_at,
    last_observed_at,
    updated_at
  ) VALUES (
    v_puppy_formula_id,
    '030111704528',
    '4.5 lb, 33 lb, 14 lb',
    1,
    'eukanuba',
    'eukanuba-current:030111704528:20260726',
    v_puppy_url,
    TRUE,
    '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
    '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
    NOW()
  )
  ON CONFLICT (
    source_slug, source_external_id, gtin, package_size
  ) DO UPDATE
  SET formula_id = excluded.formula_id,
      source_url = excluded.source_url,
      active = TRUE,
      last_observed_at = excluded.last_observed_at,
      updated_at = NOW();

  -- Record exact source-version identity evidence for all seven current pages.
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
  )
  SELECT
    formula.id,
    observation.id,
    'source_version_identity',
    jsonb_build_object(
      'current_official_package_page', TRUE,
      'gtin', target.gtin,
      'ingredient_text_hash', target.ingredient_sha256,
      'front_image_url', target.image_url,
      'evidence_method',
        'official_package_label_ocr_structurally_reviewed',
      'reused_gtin_version_conflict', target.reused_gtin,
      'gtin_resolution_policy',
        CASE
          WHEN target.reused_gtin
            THEN 'abstain_on_version_conflict'
          ELSE 'exact_current_package'
        END
    ),
    target.source_url,
    'manufacturer',
    TRUE,
    target.observed_at,
    encode(digest(
      target.source_url || '|' || target.gtin || '|' ||
      target.ingredient_sha256,
      'sha256'
    ), 'hex')
  FROM (
    VALUES
      (
        'mars petcare|eukanuba|fit body weight control large breed dry dog food|dog|adult|dry|chicken|',
        '030111301055',
        'https://www.eukanuba.com/products/dry/fit-body-weight-control-large-breed-dry-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        'aab36de11fcdf74fc54e647bc43a96b57b1a874a34c0ea7ef212dcd05870f1b7',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/39cb88d65d41656657c7c073fa3ad23929c4b332.png',
        FALSE
      ),
      (
        'mars petcare|eukanuba|fit body weight control medium breed dry dog food|dog|adult|dry|chicken|',
        '030111151018',
        'https://www.eukanuba.com/products/dry/fit-body-weight-control-medium-breed-dry-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        '126f5f25b9afa4d541a0a1fc2b0ea6fddf31a1f8a464edf106b59a6ecbca6ac7',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/b979298c4264eb5593b12cfdad2a29f32b069cc6.png',
        FALSE
      ),
      (
        'mars petcare|eukanuba|adult small breed dog food|dog|adult|dry|chicken|',
        '030111804501',
        'https://www.eukanuba.com/products/dry/adult-small-breed-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        'fe65a3bbe74a7aade415a6674540bd262bf11bc35904d7be24689d606307d0a1',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/h0ftf9kjitkvjaimpyg3.png',
        FALSE
      ),
      (
        'mars petcare|eukanuba|eukanuba adult dry dog food for medium dogs|dog|adult|dry||',
        '030111604521',
        'https://www.eukanuba.com/products/dry/eukanuba-adult-dry-dog-food-medium-dogs',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        '15d9c0c4a6a2a6eab9504ccfbd9af0af4115964e10bc57d6005b74ef3e187738',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/xecwglaaovzkglhbwgks.png',
        FALSE
      ),
      (
        'mars petcare|eukanuba|puppy large breed dry dog food|dog|puppy|dry|chicken|',
        '030111639141',
        'https://www.eukanuba.com/products/dry/puppy-large-breed-dry-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        '0e84bc01aa91f1a2486e21dfb37edf86a47db5a479bed5f0f39705f77e831f3d',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/zlodw5plqwbe4ot43ieg.png',
        FALSE
      ),
      (
        v_puppy_key,
        '030111704528',
        v_puppy_url,
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        v_puppy_hash,
        v_puppy_image,
        TRUE
      ),
      (
        'mars petcare|eukanuba|puppy small breed dry dog food|dog|puppy|dry|chicken|',
        '030111634146',
        'https://www.eukanuba.com/products/dry/puppy-small-breed-dry-dog-food',
        '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
        '7c5db90133f6ef5e4d743ec2424f9d5eb410aa1dd722b5e03ae7c699b1ba39c6',
        'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/pyhektjs6jafndwjgtmv.png',
        FALSE
      )
  ) target(
    formula_key, gtin, source_url, observed_at,
    ingredient_sha256, image_url, reused_gtin
  )
  JOIN public.catalog_formulas formula
    ON formula.formula_key = target.formula_key
  JOIN LATERAL (
    SELECT exact.id
    FROM public.catalog_observations exact
    WHERE exact.formula_id = formula.id
      AND exact.source_url = target.source_url
      AND exact.validation_status = 'accepted'
      AND encode(digest(exact.ingredient_text, 'sha256'), 'hex') =
        target.ingredient_sha256
      AND exact.front_image_url = target.image_url
    ORDER BY exact.observed_at DESC, exact.id DESC
    LIMIT 1
  ) observation ON TRUE
  ON CONFLICT (
    formula_id, field_name, source_url, content_hash
  ) DO UPDATE
  SET observation_id = excluded.observation_id,
      field_value = excluded.field_value,
      source_authority = excluded.source_authority,
      accepted = TRUE,
      observed_at = excluded.observed_at;

  -- Persist denominator aliases for the official-source identity, without
  -- weakening any generic matcher.
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
    target.alias_formula_key,
    formula.id,
    formula.identity_hash,
    'manual_review',
    target.source_url,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'current_official_package_page', TRUE,
      'consumer_brand_boundary', 'eukanuba',
      'species_boundary', 'dog',
      'life_stage_boundary', target.life_stage,
      'breed_size_boundary', target.breed_size,
      'food_form_boundary', 'dry',
      'ingredient_text_hash', target.ingredient_sha256,
      'gtin', target.gtin,
      'reused_gtin_version_conflict', target.reused_gtin,
      'reviewed_at', NOW()
    ),
    NOW()
  FROM (
    VALUES
      (
        'eukanuba|eukanuba|fit body weight control large breed dry dog food|dog|adult|dry|chicken|',
        'mars petcare|eukanuba|fit body weight control large breed dry dog food|dog|adult|dry|chicken|',
        '030111301055',
        'https://www.eukanuba.com/products/dry/fit-body-weight-control-large-breed-dry-dog-food',
        'aab36de11fcdf74fc54e647bc43a96b57b1a874a34c0ea7ef212dcd05870f1b7',
        'adult',
        'large',
        FALSE
      ),
      (
        'eukanuba|eukanuba|fit body weight control medium breed dry dog food|dog|adult|dry|chicken|',
        'mars petcare|eukanuba|fit body weight control medium breed dry dog food|dog|adult|dry|chicken|',
        '030111151018',
        'https://www.eukanuba.com/products/dry/fit-body-weight-control-medium-breed-dry-dog-food',
        '126f5f25b9afa4d541a0a1fc2b0ea6fddf31a1f8a464edf106b59a6ecbca6ac7',
        'adult',
        'medium',
        FALSE
      ),
      (
        'eukanuba|eukanuba|adult small breed dog food|dog|adult|dry|chicken|',
        'mars petcare|eukanuba|adult small breed dog food|dog|adult|dry|chicken|',
        '030111804501',
        'https://www.eukanuba.com/products/dry/adult-small-breed-dog-food',
        'fe65a3bbe74a7aade415a6674540bd262bf11bc35904d7be24689d606307d0a1',
        'adult',
        'small',
        FALSE
      ),
      (
        'eukanuba|eukanuba|eukanuba adult dry dog food for medium dogs|dog|adult|dry||',
        'mars petcare|eukanuba|eukanuba adult dry dog food for medium dogs|dog|adult|dry||',
        '030111604521',
        'https://www.eukanuba.com/products/dry/eukanuba-adult-dry-dog-food-medium-dogs',
        '15d9c0c4a6a2a6eab9504ccfbd9af0af4115964e10bc57d6005b74ef3e187738',
        'adult',
        'medium',
        FALSE
      ),
      (
        'eukanuba|eukanuba|puppy large breed dry dog food|dog|puppy|dry|chicken|',
        'mars petcare|eukanuba|puppy large breed dry dog food|dog|puppy|dry|chicken|',
        '030111639141',
        'https://www.eukanuba.com/products/dry/puppy-large-breed-dry-dog-food',
        '0e84bc01aa91f1a2486e21dfb37edf86a47db5a479bed5f0f39705f77e831f3d',
        'puppy',
        'large',
        FALSE
      ),
      (
        'eukanuba|eukanuba|puppy medium breed dry dog food|dog|puppy|dry|chicken|',
        v_puppy_key,
        '030111704528',
        v_puppy_url,
        v_puppy_hash,
        'puppy',
        'medium',
        TRUE
      ),
      (
        'eukanuba|eukanuba|puppy small breed dry dog food|dog|puppy|dry|chicken|',
        'mars petcare|eukanuba|puppy small breed dry dog food|dog|puppy|dry|chicken|',
        '030111634146',
        'https://www.eukanuba.com/products/dry/puppy-small-breed-dry-dog-food',
        '7c5db90133f6ef5e4d743ec2424f9d5eb410aa1dd722b5e03ae7c699b1ba39c6',
        'puppy',
        'small',
        FALSE
      )
  ) target(
    alias_formula_key, formula_key, gtin, source_url,
    ingredient_sha256, life_stage, breed_size, reused_gtin
  )
  JOIN public.catalog_formulas formula
    ON formula.formula_key = target.formula_key
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = excluded.formula_id,
      identity_hash = excluded.identity_hash,
      match_reason = excluded.match_reason,
      source_url = excluded.source_url,
      metadata = excluded.metadata,
      updated_at = NOW();

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases existing
    JOIN (
      VALUES
        ('Eukanuba Fit Body Weight Control Large Breed Dry Dog Food',
         'eukanuba:030111301055'),
        ('Eukanuba Fit Body Weight Control Medium Breed Dry Dog Food',
         'eukanuba:030111151018'),
        ('Eukanuba Adult Small Breed Dry Dog Food',
         'eukanuba:030111804501'),
        ('Eukanuba Adult Dry Dog Food for Medium Dogs',
         'eukanuba:030111604521'),
        ('Eukanuba Puppy Large Breed Dry Dog Food',
         'eukanuba:030111639141'),
        ('Eukanuba Puppy Medium Breed Dry Dog Food',
         v_puppy_cache),
        ('Eukanuba Puppy Small Breed Dry Dog Food',
         'eukanuba:030111634146')
    ) target(alias_text, cache_key)
      ON existing.normalized_alias =
        public.normalize_verified_product_search_query(target.alias_text)
     AND existing.active
    WHERE existing.cache_key <> target.cache_key
  ) THEN
    RAISE EXCEPTION 'Eukanuba exact search alias occupied by another version';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance
  )
  SELECT
    target.cache_key,
    target.alias_text,
    public.normalize_verified_product_search_query(target.alias_text),
    target.source_url,
    'manufacturer',
    '2026-07-26T06:54:08.980Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_current_package_version', TRUE,
      'consumer_brand_boundary', 'eukanuba',
      'species_boundary', 'dog',
      'life_stage_boundary', target.life_stage,
      'breed_size_boundary', target.breed_size,
      'food_form_boundary', 'dry',
      'gtin', target.gtin,
      'ingredient_text_hash', target.ingredient_sha256,
      'gtin_resolution_policy',
        CASE
          WHEN target.reused_gtin
            THEN 'abstain_on_version_conflict'
          ELSE 'exact_current_package'
        END
    )
  FROM (
    VALUES
      (
        'Eukanuba Fit Body Weight Control Large Breed Dry Dog Food',
        'eukanuba:030111301055',
        '030111301055',
        'https://www.eukanuba.com/products/dry/fit-body-weight-control-large-breed-dry-dog-food',
        'aab36de11fcdf74fc54e647bc43a96b57b1a874a34c0ea7ef212dcd05870f1b7',
        'adult',
        'large',
        FALSE
      ),
      (
        'Eukanuba Fit Body Weight Control Medium Breed Dry Dog Food',
        'eukanuba:030111151018',
        '030111151018',
        'https://www.eukanuba.com/products/dry/fit-body-weight-control-medium-breed-dry-dog-food',
        '126f5f25b9afa4d541a0a1fc2b0ea6fddf31a1f8a464edf106b59a6ecbca6ac7',
        'adult',
        'medium',
        FALSE
      ),
      (
        'Eukanuba Adult Small Breed Dry Dog Food',
        'eukanuba:030111804501',
        '030111804501',
        'https://www.eukanuba.com/products/dry/adult-small-breed-dog-food',
        'fe65a3bbe74a7aade415a6674540bd262bf11bc35904d7be24689d606307d0a1',
        'adult',
        'small',
        FALSE
      ),
      (
        'Eukanuba Adult Dry Dog Food for Medium Dogs',
        'eukanuba:030111604521',
        '030111604521',
        'https://www.eukanuba.com/products/dry/eukanuba-adult-dry-dog-food-medium-dogs',
        '15d9c0c4a6a2a6eab9504ccfbd9af0af4115964e10bc57d6005b74ef3e187738',
        'adult',
        'medium',
        FALSE
      ),
      (
        'Eukanuba Puppy Large Breed Dry Dog Food',
        'eukanuba:030111639141',
        '030111639141',
        'https://www.eukanuba.com/products/dry/puppy-large-breed-dry-dog-food',
        '0e84bc01aa91f1a2486e21dfb37edf86a47db5a479bed5f0f39705f77e831f3d',
        'puppy',
        'large',
        FALSE
      ),
      (
        'Eukanuba Puppy Medium Breed Dry Dog Food',
        v_puppy_cache,
        '030111704528',
        v_puppy_url,
        v_puppy_hash,
        'puppy',
        'medium',
        TRUE
      ),
      (
        'Eukanuba Puppy Small Breed Dry Dog Food',
        'eukanuba:030111634146',
        '030111634146',
        'https://www.eukanuba.com/products/dry/puppy-small-breed-dry-dog-food',
        '7c5db90133f6ef5e4d743ec2424f9d5eb410aa1dd722b5e03ae7c699b1ba39c6',
        'puppy',
        'small',
        FALSE
      )
  ) target(
    alias_text, cache_key, gtin, source_url,
    ingredient_sha256, life_stage, breed_size, reused_gtin
  )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = excluded.cache_key,
      alias_text = excluded.alias_text,
      source_url = excluded.source_url,
      source_authority = excluded.source_authority,
      evidence_observed_at = excluded.evidence_observed_at,
      provenance = excluded.provenance,
      updated_at = NOW();

  -- Every old version must remain; every current package must be serving-ready.
  IF (
    SELECT count(*)
    FROM public.product_data serving
    JOIN (
      VALUES
        ('eukanuba:030111301055',
         '4651fe950de3aca7a1580647fef630d1',
         'https://www.eukanuba.com/products/dry/fit-body-weight-control-large-breed-dry-dog-food'),
        ('eukanuba:030111151018',
         '5a714a330b9605a358d964e03256b799',
         'https://www.eukanuba.com/products/dry/fit-body-weight-control-medium-breed-dry-dog-food'),
        ('eukanuba:030111804501',
         'b098e957a3df03db2eb2b575b09f8185',
         'https://www.eukanuba.com/products/dry/adult-small-breed-dog-food'),
        ('eukanuba:030111604521',
         '2d86bfef2d1efd95626591dd0c4cffa1',
         'https://www.eukanuba.com/products/dry/eukanuba-adult-dry-dog-food-medium-dogs'),
        ('eukanuba:030111639141',
         'f5ad068e6a09e6bfbac853ee3ddce3a6',
         'https://www.eukanuba.com/products/dry/puppy-large-breed-dry-dog-food'),
        (v_puppy_cache,
         '0882f4ca1aab3e7bea960b749c1418df',
         v_puppy_url),
        ('eukanuba:030111634146',
         '84b2fe38fbbe34b79b266d37e3daa474',
         'https://www.eukanuba.com/products/dry/puppy-small-breed-dry-dog-food')
    ) expected(cache_key, ingredient_md5, source_url)
      ON expected.cache_key = serving.cache_key
     AND expected.ingredient_md5 = md5(serving.ingredient_text)
     AND expected.source_url = serving.source_url
    WHERE serving.formula_evidence_tier = 'web_label_version'
      AND serving.source_quality = 'manufacturer'
      AND serving.ingredient_verification_status = 'label_ocr_verified'
      AND serving.image_verification_status = 'manufacturer'
      AND public.catalog_quality_state(
        serving.pet_type,
        serving.is_complete_food,
        serving.catalog_exclusion_reason,
        serving.ingredient_text,
        serving.ingredient_count,
        serving.ingredient_verification_status,
        serving.image_url,
        serving.image_verification_status,
        serving.source_url,
        serving.expires_at
      ) = 'verified_ready'
  ) <> 7 THEN
    RAISE EXCEPTION 'Eukanuba current exact serving postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data serving
    JOIN (
      VALUES
        ('eukanuba:030111280114', 'a189180399846ea6fdc3060404ef1e2a'),
        ('eukanuba:030111160027', 'ab77a7959cd184c991f09830f70d1cfc'),
        ('eukanuba:030111302076', 'daa540e99ea44a4c0c0230a327619411'),
        ('eukanuba:030111704528', 'a56d83e859c2767bc80ac213cbb0cf7a'),
        ('eukanuba:030111150066', '9e1f80a45c1727260bb8518b3e3ac33c')
    ) expected(cache_key, ingredient_md5)
      ON expected.cache_key = serving.cache_key
     AND expected.ingredient_md5 = md5(serving.ingredient_text)
    WHERE serving.formula_evidence_tier = 'web_label_version'
  ) <> 5 THEN
    RAISE EXCEPTION 'Eukanuba historical versions were not retained';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('030111704528', 8)
  ) <> 0 THEN
    RAISE EXCEPTION
      'Eukanuba reused Puppy Medium GTIN must safely abstain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('030111804501', 'eukanuba:030111804501'),
        ('030111604521', 'eukanuba:030111604521'),
        ('030111639141', 'eukanuba:030111639141'),
        ('030111634146', 'eukanuba:030111634146')
    ) expected(gtin, cache_key)
    WHERE (
      SELECT resolved.cache_key
      FROM public.resolve_verified_product_by_gtin(expected.gtin, 8) resolved
      LIMIT 1
    ) IS DISTINCT FROM expected.cache_key
  ) THEN
    RAISE EXCEPTION 'Eukanuba current non-conflicting GTIN resolution failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('Eukanuba Fit Body Weight Control Large Breed Dry Dog Food',
         'eukanuba:030111301055'),
        ('Eukanuba Fit Body Weight Control Medium Breed Dry Dog Food',
         'eukanuba:030111151018'),
        ('Eukanuba Adult Small Breed Dry Dog Food',
         'eukanuba:030111804501'),
        ('Eukanuba Adult Dry Dog Food for Medium Dogs',
         'eukanuba:030111604521'),
        ('Eukanuba Puppy Large Breed Dry Dog Food',
         'eukanuba:030111639141'),
        ('Eukanuba Puppy Medium Breed Dry Dog Food',
         v_puppy_cache),
        ('Eukanuba Puppy Small Breed Dry Dog Food',
         'eukanuba:030111634146')
    ) expected(query_text, cache_key)
    WHERE (
      SELECT result.cache_key
      FROM public.search_verified_products(expected.query_text, 8) result
      ORDER BY result.rank DESC
      LIMIT 1
    ) IS DISTINCT FROM expected.cache_key
  ) THEN
    RAISE EXCEPTION 'Eukanuba exact-search rank-one postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_formula_aliases alias
    WHERE alias.alias_formula_key IN (
      'eukanuba|eukanuba|fit body weight control large breed dry dog food|dog|adult|dry|chicken|',
      'eukanuba|eukanuba|fit body weight control medium breed dry dog food|dog|adult|dry|chicken|',
      'eukanuba|eukanuba|adult small breed dog food|dog|adult|dry|chicken|',
      'eukanuba|eukanuba|eukanuba adult dry dog food for medium dogs|dog|adult|dry||',
      'eukanuba|eukanuba|puppy large breed dry dog food|dog|puppy|dry|chicken|',
      'eukanuba|eukanuba|puppy medium breed dry dog food|dog|puppy|dry|chicken|',
      'eukanuba|eukanuba|puppy small breed dry dog food|dog|puppy|dry|chicken|'
    )
      AND alias.match_reason = 'manual_review'
      AND alias.metadata->>'exact_formula_identity' = 'true'
  ) <> 7 THEN
    RAISE EXCEPTION 'Eukanuba durable formula aliases incomplete';
  END IF;
END;
$migration$;
