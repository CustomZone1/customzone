export type InfoSection = {
  slug: string;
  title: string;
  description: string;
  points: string[];
};

export const infoSections: InfoSection[] = [
  {
    slug: "match-rules",
    title: "Match Rules",
    description: "Timing, fair-play rules, and player behavior guidelines.",
    points: [
      "Always join the room on time. The match will start 7 minutes after the scheduled time.",
      "Do not spam in the custom room chatbox. Otherwise, you will be kicked.",
      "Always sit in your assigned slot number. Otherwise, the host is expected to kick you.",
      "All types of hacks, panels, or external software are strictly prohibited.",
      "Fill in your correct in-game name.",
      "Emotes and similar in-game expressions are allowed.",
      "Be respectful toward the admin, host, and other players.",
      "There may be a slight delay in crediting your winning amount to your wallet. Please be patient and keep trust in the process.",
      "Teaming up with other players or other teams is strictly prohibited.",
      "All in-game features (weapons, characters, tools, etc.) are allowed, as they are an integrated part of the game.",
      "If you lose a tournament, do not worry; more opportunities will come.",
    ],
  },
  {
    slug: "prizes",
    title: "Prizes",
    description: "Prize flow, eligibility, and credit timeline.",
    points: [
      "Prizes will be distributed in the same manner described on the tournament page.",
      "Prize money will be automatically sent to the account that booked the slot(s).",
      "If any rule is broken, the player must not expect any prize.",
      "Prize distribution may take some time. Please wait and keep trust in the process.",
      "Prize money will be credited directly to the user's in-app wallet.",
      "The user must be logged in to claim any prizes.",
      "In team matches, prizes will be credited to the account that booked the slots. Distribution among team members is an internal matter, and the admin/host is neither responsible nor concerned about it.",
    ],
  },
  {
    slug: "wallet-withdraw",
    title: "Wallet & Withdraw",
    description: "Deposit and withdrawal steps, limits, and dispute handling.",
    points: [
      "To deposit money into the wallet, the user must pay to the given UPI ID, then paste the transaction ID in the wallet after 10 minutes. If the transaction is not registered or verified by admin immediately, wait and try again later.",
      "To withdraw, the user must paste their UPI ID and the amount they want to withdraw. The amount will be deducted instantly from the wallet, and the admin will send the same amount to the given UPI ID shortly.",
      "Minimum withdrawal amount is 200.",
      "If any amount is credited or debited from a user's wallet by mistake or due to misunderstanding, it will be resolved in a short time. The user must not try to withdraw it.",
      "The wallet system is safe and trusted.",
    ],
  },
  {
    slug: "support",
    title: "Support",
    description: "Official channels for help and issue reporting.",
    points: [
      "For any help, send a WhatsApp message to 9522202995 or 8770524175.",
      "Do not call these numbers.",
      "You can also send an email to customzone840@gmail.com.",
    ],
  },
];

export const infoSectionMap = new Map(infoSections.map((section) => [section.slug, section]));
