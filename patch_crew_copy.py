from pathlib import Path
import re

def patch(path, replacements):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    orig = text
    for a, b in replacements:
        if a not in text:
            print("MISS", path, repr(a[:70]))
        else:
            text = text.replace(a, b)
            print("OK", path, repr(a[:50]))
    if text != orig:
        p.write_text(text, encoding="utf-8", newline="\n")
        print("WROTE", path)
    else:
        print("NO CHANGE", path)

patch(
    "src/app/admin/customers/onboard/page.tsx",
    [
        ("Boat locked in — add cook logins below.", "Boat locked in — add crew logins below."),
        ("Boat locked in - add cook logins below.", "Boat locked in — add crew logins below."),
        ("a cook&apos;s password later", "a crew member&apos;s password later"),
    ],
)

t = Path("src/app/admin/customers/onboard/page.tsx").read_text(encoding="utf-8")
t2 = re.sub(r"add cook logins below\.", "add crew logins below.", t)
t2 = re.sub(
    r"Company .{1,12} boat .{1,12} crew logins\. Shared history for everyone on the boat\.",
    "Company \u2192 boat \u2192 crew logins. Shared history for everyone on the boat.",
    t2,
)
old_blurb = "Separate emails/passwords. Same boat history. Type the password"
if old_blurb in t2 and "Anyone on the boat" not in t2:
    t2 = t2.replace(
        old_blurb,
        "Anyone on the boat who orders \u2014 cook, captain, steward, whoever. Separate emails/passwords, shared boat history. Type the password",
    )
if t2 != t:
    Path("src/app/admin/customers/onboard/page.tsx").write_text(t2, encoding="utf-8", newline="\n")
    print("WROTE onboard extras")

patch(
    "src/app/admin/customers/page.tsx",
    [
        (
            "One place for boat customers, cook logins, and order history.",
            "One place for boat customers, crew logins, and order history.",
        ),
        (
            "Tip: Cooks can also reset their own password from Sign in",
            "Tip: Crew can also reset their own password from Sign in",
        ),
    ],
)

patch(
    "src/components/admin/CustomerLoginsPanel.tsx",
    [
        (
            "// Jen's cook/captain login manager - set password (typed), quick-add, search.",
            "// Boat crew login manager - set password (typed), quick-add, search.",
        ),
        (
            "Password set for ${member.display_name || member.email || 'cook'}",
            "Password set for ${member.display_name || member.email || 'crew member'}",
        ),
        ("Cook &amp; captain logins", "Boat crew logins"),
        (
            "Type a new password and read it to them on the phone. Cooks can also reset themselves from",
            "Type a new password and read it to them on the phone. Crew can also reset themselves from",
        ),
        ("No cook logins yet.", "No crew logins yet."),
    ],
)

for path in [
    "src/app/admin/customers/onboard/page.tsx",
    "src/app/admin/customers/page.tsx",
    "src/components/admin/CustomerLoginsPanel.tsx",
]:
    for i, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if re.search(r"(?i)cook", line) and not re.search(r"value=\"cook\"|'cook'|\"cook\"|useState|qaRole|setRole|setQaRole|as typeof role", line):
            print(f"LEFT {path}:{i} {line.strip()[:140]}")
