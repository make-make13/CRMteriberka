import { z } from 'zod';

// ─── Тип ошибки валидации ──────────────────────────────────────────────────

/**
 * Отличаем ошибки валидации от неожиданных ошибок БД/рантайма.
 * В server.ts: ValidationError → 400, всё остальное → 500.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ─── Хелпер ────────────────────────────────────────────────────────────────

/**
 * Валидирует данные схемой Zod.
 * При ошибке бросает ValidationError с читаемым сообщением.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    });
    throw new ValidationError(messages.join('; '));
  }
  return result.data;
}

// ─── Общие примитивы ───────────────────────────────────────────────────────

/** Строка (пустая допустима — фронтенд шлёт '' через || '' fallback) */
const anyString = z.string();

/** Непустая строка */
const nonEmptyString = z.string().min(1, 'Поле не может быть пустым');

/** ISO-дата: строка, которую Date.parse понимает */
const isoDateString = z
  .string()
  .min(1, 'Дата обязательна')
  .refine(
    (val) => !Number.isNaN(Date.parse(val)),
    { message: 'Некорректный формат даты (ожидается ISO 8601)' },
  );

// ─── Бронирование ──────────────────────────────────────────────────────────

export const bookingSchema = z
  .object({
    id: anyString.default(''),
    contractId: anyString.default(''),

    objectId: nonEmptyString,

    baseType: z.enum(['chunga-changa', 'golubaya-bukhta'], {
      error: 'baseType бронирования должен быть "chunga-changa" или "golubaya-bukhta"',
    }),

    startTime: isoDateString,
    endTime: isoDateString,

    /**
     * type — обязательный enum: лучше вернуть 400, чем молча записать неверное значение.
     */
    type: z.enum(['main', 'service'], {
      error: 'type бронирования должен быть "main" или "service"',
    }),

    /**
     * price — число >= 0 если присутствует.
     * normalizeContract в localDatabase тоже делает Number(... || 0),
     * но лучше поймать явный мусор здесь.
     */
    price: z.number({ error: 'price должна быть числом' }).min(0, 'price не может быть отрицательной').default(0),
  })
  .passthrough()
  // Перекрёстная проверка: endTime > startTime
  .refine(
    (b) => {
      const start = Date.parse(b.startTime);
      const end = Date.parse(b.endTime);
      // Если даты невалидны — isoDateString уже поймает выше; здесь не повторяем
      if (Number.isNaN(start) || Number.isNaN(end)) return true;
      return end > start;
    },
    { message: 'endTime должен быть позже startTime' },
  );

// ─── Договор ───────────────────────────────────────────────────────────────

export const contractSchema = z
  .object({
    id: anyString,

    /** Номер договора — пустая строка пока разрешена (pre_booking генерирует ПБ-...) */
    number: anyString,

    /**
     * clientId — пустая строка РАЗРЕШЕНА.
     * PreBookingModal намеренно шлёт clientId: '' для нового pre_booking.
     */
    clientId: anyString,

    baseType: z.enum(['chunga-changa', 'golubaya-bukhta'], {
      error: 'baseType должен быть "chunga-changa" или "golubaya-bukhta"',
    }),

    status: z.enum(['pre_booking', 'signed_not_paid', 'partial_paid', 'paid', 'cancelled'], {
      error: 'Неверный статус договора',
    }),

    totalAmount: z
      .number({ error: 'totalAmount должна быть числом' })
      .min(0, 'totalAmount не может быть отрицательной')
      .default(0),

    prepayment: z
      .number({ error: 'prepayment должна быть числом' })
      .min(0, 'prepayment не может быть отрицательной')
      .default(0),

    remainder: z
      .number({ error: 'remainder должна быть числом' })
      .min(0, 'remainder не может быть отрицательной')
      .default(0),

    dateSigned: isoDateString,

    bookings: z.array(bookingSchema, { error: 'bookings должен быть массивом' }),

    createdAt: anyString.default(''),
    nextReminderAt: anyString.optional().nullable(),
    dismissedPaymentAlertAt: anyString.optional().nullable(),
    dismissedPaymentAlertRemainder: z.number().optional().nullable(),
    comment: anyString.optional().nullable(),
    guestsCount: z.number().int().min(0).optional().nullable(),
  })
  .passthrough()
  .superRefine((contract, ctx) => {
    if (contract.prepayment > contract.totalAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prepayment'],
        message: 'Предоплата не может быть больше общей суммы договора',
      });
    }

    const expectedRemainder = contract.totalAmount - contract.prepayment;
    if (Math.abs(contract.remainder - expectedRemainder) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remainder'],
        message: 'Остаток должен быть равен общей сумме минус предоплате',
      });
    }
  });

// ─── Физический клиент ─────────────────────────────────────────────────────

export const physicalClientSchema = z
  .object({
    id: anyString,
    type: z.literal('physical'),

    /**
     * firstName, lastName, phone — string, пустая строка допустима.
     * ClientModal шлёт || '' fallback даже для required-полей.
     */
    firstName: anyString,
    lastName: anyString,
    middleName: anyString.optional().nullable(),
    birthDate: anyString.optional().nullable(),
    phone: anyString,
    email: anyString.optional().nullable(),

    // Паспортные поля — фронт всегда шлёт '' через || ''
    passportSeries: anyString.optional(),
    passportNumber: anyString.optional(),
    passportIssuedBy: anyString.optional(),
    passportIssueDate: anyString.optional(),
    registrationAddress: anyString.optional(),

    additionalInfo: anyString.optional().nullable(),
    isBlacklisted: z.boolean({ error: 'isBlacklisted должен быть булевым' }),
    createdAt: anyString.optional(),
  })
  .passthrough();

// ─── Юридический клиент ────────────────────────────────────────────────────

export const legalClientSchema = z
  .object({
    id: anyString,
    type: z.literal('legal'),

    /**
     * organizationName, inn, etc. — string, пустая строка допустима.
     * Форма шлёт || '' fallback.
     */
    organizationName: anyString,
    inn: anyString,
    kpp: anyString.optional().nullable(),
    ogrn: anyString.optional().nullable(),
    legalAddress: anyString,
    contactPerson: anyString,
    phone: anyString,
    email: anyString.optional().nullable(),
    bankName: anyString.optional().nullable(),
    bankAccount: anyString.optional().nullable(),
    corrAccount: anyString.optional().nullable(),
    bik: anyString.optional().nullable(),
    additionalInfo: anyString.optional().nullable(),
    isBlacklisted: z.boolean({ error: 'isBlacklisted должен быть булевым' }),
    createdAt: anyString.optional(),
  })
  .passthrough();

// ─── Объединённая схема клиента ────────────────────────────────────────────

/**
 * discriminatedUnion по полю type — Zod выберет нужную схему автоматически.
 * Если type не 'physical' и не 'legal' — ошибка валидации.
 */
export const clientSchema = z.discriminatedUnion('type', [
  physicalClientSchema,
  legalClientSchema,
]);
