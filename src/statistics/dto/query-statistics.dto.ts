import { DateRangeQueryDto } from '../../common';

/** from/to are optional; the service defaults to the current month. */
export class QueryStatisticsDto extends DateRangeQueryDto {}
