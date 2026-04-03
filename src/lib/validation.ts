const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const kenyaPhonePattern = /^(?:\+?254|0)(?:7\d{8}|1\d{8})$/;

export const isValidEmail = (value: string) => emailPattern.test(value.trim());

export const isValidKenyanPhone = (value: string) =>
  kenyaPhonePattern.test(value.replace(/[\s-]/g, ''));

export const normalizeKenyanPhone = (value: string) => {
  const compact = value.replace(/[\s-]/g, '');

  if (compact.startsWith('+254')) {
    return compact;
  }

  if (compact.startsWith('254')) {
    return `+${compact}`;
  }

  if (compact.startsWith('0')) {
    return `+254${compact.slice(1)}`;
  }

  return compact;
};
