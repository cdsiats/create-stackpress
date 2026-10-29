import {
  cancel,
  confirm,
  isCancel,
  note,
  select,
  text
} from '@clack/prompts';

export type TextPromptOptions = {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string | undefined) => string | undefined;
};

export type SelectPromptOptions<T extends string> = {
  message: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  initialValue?: T;
};

export type ConfirmPromptOptions = {
  message: string;
  initialValue?: boolean;
};

export type PromptAdapter = {
  text(options: TextPromptOptions): Promise<string | symbol>;
  select<T extends string>(options: SelectPromptOptions<T>): Promise<T | symbol>;
  confirm(options: ConfirmPromptOptions): Promise<boolean | symbol>;
  note(message: string, title: string): void;
  cancel(message: string): void;
  isCancel(value: unknown): boolean;
};

export function createPrompts(): PromptAdapter {
  return {
    text(options) {
      return text(options);
    },
    select<T extends string>(options: SelectPromptOptions<T>): Promise<T | symbol> {
      return select(options as never) as Promise<T | symbol>;
    },
    confirm(options) {
      return confirm(options);
    },
    note(message, title) {
      note(message, title);
    },
    cancel(message) {
      cancel(message);
    },
    isCancel(value) {
      return isCancel(value);
    }
  };
}
