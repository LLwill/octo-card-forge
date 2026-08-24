import type {
  CardInspection,
  InspectedAction,
  InspectedInput,
  InspectedToggle,
  JsonObject,
} from "./types.js";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Derive the public interaction surface from compiled standard Adaptive Card
 * JSON. This is compatibility metadata, never a second authored protocol.
 */
export function inspectCard(payload: JsonObject): CardInspection {
  const actions: InspectedAction[] = [];
  const inputs: InspectedInput[] = [];
  const toggles: InspectedToggle[] = [];

  const walk = (value: unknown, path: string, parentVisible: boolean): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, parentVisible));
      return;
    }
    if (!isObject(value)) return;

    const type = typeof value.type === "string" ? value.type : undefined;
    const isVisible = parentVisible && value.isVisible !== false;
    if (type?.startsWith("Input.") && typeof value.id === "string") {
      const input: InspectedInput = {
        path,
        id: value.id,
        type,
        isRequired: value.isRequired === true,
        isVisible,
      };
      if (typeof value.maxLength === "number") input.maxLength = value.maxLength;
      if (type === "Input.ChoiceSet") {
        input.isMultiSelect = value.isMultiSelect === true;
        if (Array.isArray(value.choices)) {
          input.choiceValues = value.choices.flatMap((choice) =>
            isObject(choice) && typeof choice.value === "string" ? [choice.value] : []
          );
        }
      }
      inputs.push(input);
    }

    if (type?.startsWith("Action.")) {
      const action: InspectedAction = { path, type };
      if (typeof value.id === "string") action.id = value.id;
      if (type === "Action.Submit") {
        action.associatedInputs = value.associatedInputs === "none" ? "none" : "auto";
        action.dataKeys = isObject(value.data) ? Object.keys(value.data).sort() : [];
      }
      actions.push(action);

      if (type === "Action.ToggleVisibility") {
        const toggle: InspectedToggle = { path, targets: [] };
        if (Array.isArray(value.targetElements)) {
          for (const target of value.targetElements) {
            if (typeof target === "string") {
              toggle.targets.push({ elementId: target });
            } else if (isObject(target) && typeof target.elementId === "string") {
              toggle.targets.push({
                elementId: target.elementId,
                ...(typeof target.isVisible === "boolean"
                  ? { isVisible: target.isVisible }
                  : {}),
              });
            }
          }
        }
        toggles.push(toggle);
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (key !== "data") walk(child, `${path}.${key}`, isVisible);
    }
  };

  walk(payload, "$", true);
  const allInputIds = inputs.map((input) => input.id);
  for (const action of actions) {
    if (action.type === "Action.Submit") {
      action.inputIds = action.associatedInputs === "none" ? [] : [...allInputIds];
    }
  }

  return { actions, inputs, toggles };
}
