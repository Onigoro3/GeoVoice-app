// src/vipList.js

// ここに登録したメールアドレスのユーザーは、無条件で「課金済み」として扱われます
export const VIP_EMAILS = [
  "admin@example.com",     // 管理者
  "developer@example.com", // 開発者
  "friend@example.com",    // 友人
  // ここに追加していけばOK
];

export const isVipUser = (email) => {
  if (!email) return false;
  return VIP_EMAILS.includes(email);
};