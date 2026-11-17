/**
 * Clicking or tabbing into a number field selects what is in it, so typing
 * replaces the value instead of landing beside it (RIG, 11/17: "I just want to
 * go 2, 0, 0, 0, 0"). Clicking again in a field that already has focus places
 * the cursor as usual, for fixing one digit.
 *
 * A number field is a text input with a decimal or numeric keyboard, or a
 * number input: every money, weight, share and year field in the app.
 */

function isNumberField(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.readOnly || target.disabled) return false;
  return target.type === 'number' || target.inputMode === 'decimal' || target.inputMode === 'numeric';
}

export function selectNumberFieldsOnFocus(root: Document = document): () => void {
  // The click that focused the field would put the cursor where it landed,
  // undoing the selection; that one mouseup is cancelled.
  let justFocused: HTMLInputElement | null = null;

  const onFocusIn = (event: FocusEvent) => {
    if (!isNumberField(event.target)) return;
    event.target.select();
    justFocused = event.target;
  };
  const onMouseUp = (event: MouseEvent) => {
    if (justFocused !== null && event.target === justFocused) event.preventDefault();
    justFocused = null;
  };
  const onKeyDown = () => {
    justFocused = null;
  };

  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('mouseup', onMouseUp, true);
  root.addEventListener('keydown', onKeyDown, true);
  return () => {
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('mouseup', onMouseUp, true);
    root.removeEventListener('keydown', onKeyDown, true);
  };
}
