"use client";

import { useState, type InputHTMLAttributes } from "react";
import { formatNumber } from "@/lib/number-format";

type AmountInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | string;
  onValueChange: (value: string) => void;
};

function normalizeAmount(text: string) {
  const value = text.trim();
  // Italian grouped amounts, including pasted values such as 50.000,50.
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d*)?$/.test(value)) return value.replace(/\./g, "").replace(",", ".");
  return value.replace(",", ".");
}

function displayAmount(value: number | string) {
  if (value === "") return "";
  const text = String(value);
  const number = Number(text);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(number)) return text.replace(".", ",");
  return formatNumber(number);
}

export function AmountInput({ value, onValueChange, ...props }: AmountInputProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  return <input {...props} type="text" inputMode="decimal" value={editing ? text : displayAmount(value)}
    onFocus={() => { setText(displayAmount(value)); setEditing(true); }}
    onChange={event => { setText(event.target.value); onValueChange(normalizeAmount(event.target.value)); }}
    onBlur={() => setEditing(false)} />;
}
