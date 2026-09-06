import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Запрос на проверку текста на ИИ-штампы.
 *
 * `content-factory-next-tu3k.3`. Ровно то же, что принимает вход одной мыслью:
 * двадцать тысяч знаков — потолок и там, и здесь, чтобы человек не получил
 * отказ на тексте, который продукт минуту назад согласился прочитать.
 *
 * Площадка не проверяется списком намеренно. Незнакомое имя получает
 * умолчания, а не отказ: проверка на штампы не должна становиться причиной,
 * по которой человек не увидел свой текст.
 */
export class SlopCheckDto {
  @IsString()
  @MaxLength(20_000)
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  platform?: string;

  @IsOptional()
  @IsIn(['ru', 'en'])
  locale?: 'ru' | 'en';

  /** `true`, когда текст пришёл из окна поста как HTML. */
  @IsOptional()
  @IsBoolean()
  html?: boolean;
}
