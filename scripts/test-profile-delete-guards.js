#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const profileSource = fs.readFileSync(path.join(root, "screens/ProfileScreen.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`profile delete guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  profileSource.includes("const [deleting, setDeleting] = useState(false)") &&
    profileSource.includes("const deleteFlowOpenRef = useRef(false)") &&
    profileSource.includes("if (deleteFlowOpenRef.current || deleting) return;"),
  "Profile delete flow must guard against duplicate destructive prompts"
);

const deleteBlockStart = profileSource.indexOf("const handleDeleteAccount = () =>");
const deleteBlockEnd = profileSource.indexOf("const appVersion =", deleteBlockStart);
assert(deleteBlockStart !== -1 && deleteBlockEnd !== -1, "Profile delete handler must be present");

const deleteBlock = profileSource.slice(deleteBlockStart, deleteBlockEnd);
const permanentDeleteIndex = deleteBlock.indexOf('text: "Delete Permanently"');
const awaitDeleteIndex = deleteBlock.indexOf("await deleteAccount()", permanentDeleteIndex);
const finallyIndex = deleteBlock.indexOf("} finally {", awaitDeleteIndex);

assert(
  permanentDeleteIndex !== -1 && awaitDeleteIndex !== -1 && finallyIndex !== -1,
  "permanent delete action must await deleteAccount and use a finally block"
);

const finallyBlock = deleteBlock.slice(finallyIndex, deleteBlock.indexOf("}", finallyIndex + 12) + 1);
assert(
  finallyBlock.includes("setDeleting(false);") &&
    finallyBlock.includes("deleteFlowOpenRef.current = false;"),
  "successful or failed account deletion must reset Profile delete loading and flow lock"
);

const catchBlock = deleteBlock.slice(deleteBlock.indexOf("} catch (err) {", awaitDeleteIndex), finallyIndex);
assert(
  !catchBlock.includes("setDeleting(false);") &&
    !catchBlock.includes("deleteFlowOpenRef.current = false;"),
  "delete reset must live in finally, not only in the failure path"
);

assert(
  /disabled=\{deleting\}/.test(profileSource) &&
    profileSource.includes("Deleting...") &&
    profileSource.includes("Delete Account"),
  "Profile delete button must still expose loading and normal states"
);

console.log("profile delete guard passed");
