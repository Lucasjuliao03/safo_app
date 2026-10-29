/** Shared course rules for study metadata and protected content. */
export function isTopicVisibleForCourse(
  targetCourseIds: Array<number | string> | null | undefined,
  courseId: number | null,
): boolean {
  return courseId === null || !targetCourseIds?.length
    || targetCourseIds.some(id => Number(id) === courseId);
}
