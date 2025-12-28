/**
 * 클래스 이름들을 조건부로 합쳐주는 헬퍼 함수입니다.
 */
export function cn(
  ...inputs: (
    | string
    | boolean
    | undefined
    | null
    | { [key: string]: boolean }
  )[]
) {
  return inputs
    .filter(Boolean)
    .map((input) => {
      if (typeof input === "object" && input !== null) {
        return Object.entries(input)
          .filter(([, value]) => value)
          .map(([key]) => key)
          .join(" ");
      }
      return input;
    })
    .join(" ");
}
