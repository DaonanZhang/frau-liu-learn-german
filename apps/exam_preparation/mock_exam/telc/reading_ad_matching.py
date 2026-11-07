import re


def is_version2_item_text(item_text):
    return re.match(r"^\s*\(\s*version2\s*\)\s*", str(item_text or ""), flags=re.IGNORECASE) is not None


def selected_item_ids(items, variant=0):
    items = list(items)
    version2_items = [item for item in items if is_version2_item_text(item.item_text)]
    if not version2_items:
        return [item.pk for item in items]
    regular_items = [item for item in items if item not in version2_items]
    if variant == 0:
        selected = regular_items
    else:
        selected = list(regular_items)
        selected[variant - 1] = version2_items[0]
    return [item.pk for item in selected]
