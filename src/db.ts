import Chronos from './chronos'
import { ObjectType, Field, Int, Resolver, Query, Arg, Root, FieldResolver, useContainer } from 'type-graphql'

@ObjectType({ description: 'The location (usually, room) of a class.' })
export class CourseLocation {
  @Field({ description: 'The human-readable name of the room.' })
  name: string;

  static isSameLocation(as: CourseLocation[], bs: CourseLocation[]): boolean {
    if (as.length != bs.length)
      return false

    for (let i = 0; i < as.length; i++) {
      if (as[i].name != bs[i].name)
        return false
    }

    return true
  }
}

@ObjectType({ description: 'A member of the staff; usually, a teacher.' })
export class StaffMember {
  @Field({ description: 'The full-name of the member of the staff.' })
  name: string;

  static isSameStaff(as: StaffMember[], bs: StaffMember[]): boolean {
    if (as.length != bs.length)
      return false

    for (let i = 0; i < as.length; i++) {
      if (as[i].name != bs[i].name)
        return false
    }

    return true
  }
}

@ObjectType({ description: 'An instance of a class in a day.' })
export class Course {
  @Field({ description: 'The exact start date and time of the class.' })
  start: Date;

  @Field(type => Int, { description: 'The duration of the class in minutes.' })
  duration: number;

  @Field({ description: 'The name of the class.' })
  name: string;

  @Field(type => [CourseLocation], { description: 'The location of the class.' })
  locations: CourseLocation[] = [];

  @Field(type => [StaffMember], { description: 'The staff member teaching the class.' })
  staff: StaffMember[] = [];

  @Field({ description: 'The expected end date and time of the class, computed from its start date and duration.' })
  get end(): Date {
    return new Date(this.start.valueOf() + 60_000 * this.duration)
  }
}

@ObjectType({ description: 'A day of classes.' })
export class ScheduleDay {
  @Field(type => [Course], { description: 'The list of all classes of the day.' })
  courses: Course[] = []

  @Field({ description: 'The date and time of the start of the first class of the day.' })
  get dayStart(): Date {
    return this.courses[0].start
  }

  @Field({ description: 'The date and time of the end of the last class of the day.'})
  get dayEnd(): Date {
    return this.courses[this.courses.length - 1].end
  }
}

@ObjectType({ description: 'A group of students used to organize classes.' })
export class Group {
  @Field({ description: 'The name of the group.' })
  name: string;

  @Field(type => Int, { description: 'The identifier of the group, as used internally by Chronos.' })
  id: number;

  schedule: ScheduleDay[] = [];
}

@ObjectType({ description: 'The current status of the GraphQL server.' })
export class ServerStatus {
  @Field({ description: 'A boolean that indicates if the GraphQL is currently reloading its data.' })
  loading: boolean;

  @Field({ description: 'The date and time of the last time a update was started.' })
  lastUpdateStartTime: Date;

  @Field({ description: 'The date and time of the end of the last update.' })
  lastUpdateEndTime: Date;
}

export class Database {
  loading: number = 0;

  startedLoading: Date = new Date(0);
  finishedLoading: Date = new Date(0);

  chronos: Chronos = new Chronos();
  savedGroups: Group[] = [];

  provideToResolver() {
    const self = this

    useContainer({
      get: (_, __) => new ChronosResolver(self)
    })
  }

  get isLoading() {
    return this.loading > 0
  }

  private async loadWeek(groupId: number, weekId: number, group: Group) {
    const week = await this.chronos.getWeek(weekId, groupId)

    for (const weekDay of week.DayList) {
      if (weekDay.CourseList.length == 0)
        continue

      const day = new ScheduleDay()

      for (const dayCourse of weekDay.CourseList) {
        const course = new Course()

        course.name      = dayCourse.Name
        course.start     = new Date(Date.parse(dayCourse.BeginDate))
        course.duration  = dayCourse.Duration
        course.locations = dayCourse.RoomList.map(room => <CourseLocation>{ name: room.Name })
        course.staff     = dayCourse.StaffList.map(member => <StaffMember>{ name: member.Name })

        // Merge course with previous one if needed
        const prev  = day.courses.length ? day.courses[day.courses.length - 1] : null
        const merge = prev                                            &&
                      prev.end.valueOf()  === course.start.valueOf()  &&
                      prev.name           === course.name             &&
                      CourseLocation.isSameLocation(prev.locations, course.locations)

      if (merge) {
          prev.duration += course.duration
        } else {
          day.courses.push(course)
        }
      }

      group.schedule.push(day)
    }
  }

  private async loadGroup(groupData: any, groups: Group[]) {
    for (const child of groupData.Groups || []) {
      this.loadGroup(child, groups)
    }

    if (groupData.Type != 1)
      return

    const group  = <Group>{ id: groupData.Id, name: groupData.Name, schedule: [] }
    const weekId = Chronos.getWeekId(new Date())

    for (let i = -4; i <= 4; i++) {
      await this.loadWeek(group.id, weekId + i, group)
    }

    groups.push(group)
  }

  async load(waitTime = 10_000) {
    if (waitTime === 10_000)
      this.startedLoading = new Date(Date.now())

    this.loading++

    console.log('Refreshing data...')

    let groups = []

    if (this.savedGroups.length == 0)
      groups = this.savedGroups

    try {
      for (const group of await this.chronos.getGroups()) {
        await this.loadGroup(group, groups)
      }
    } catch {
      console.log('Unable to fetch data, waiting', waitTime, 'ms.')

      setTimeout(async () => await this.load(waitTime * 5), waitTime)
      this.loading--
      return
    }

    this.savedGroups = groups

    console.log('Done refreshing data.')

    this.loading--
    this.finishedLoading = new Date(Date.now())
  }
}

@Resolver(Group)
export class ChronosResolver {
  constructor(
    private readonly db: Database
  ) {}

  @Query(returns => [Group], { description: 'Returns the list of groups matching the given name(s), or all groups if no name is provided.' })
  groups(
    @Arg("name", type => [String], { nullable: true, description: 'The name(s) of the group(s) to return.' }) name: string[] | undefined,
  ): Group[] {
    if (name == undefined) {
      return this.db.savedGroups
    } else {
      return this.db.savedGroups.filter(x => name.includes(x.name))
    }
  }

  @Query(returns => [Course], { description: 'Returns the list of classes the given group will have in the given time range.' })
  classes(
    @Arg("name", { description: 'The name of the group whose classes will be returned.' })                                name: string,
    @Arg("from", { nullable: true, description: 'The start date, or today if no value is provided.' })                    from: Date | undefined,
    @Arg("to"  , { nullable: true, description: 'The end date, or a week from the start date if no value is provided.' }) to  : Date | undefined,
  ) : Course[] {
    const group = this.db.savedGroups.find(x => x.name == name)

    if (!group) return []

    const allClasses = []

    for (const day of this.schedule(group, from, to)) {
      allClasses.push(...day.courses)
    }

    return allClasses
  }

  @FieldResolver(of => [ScheduleDay], { description: 'Returns the schedule of the group in the given time range.' })
  schedule(
    @Root()                                                                                                               group: Group,
    @Arg("from", { nullable: true, description: 'The start date, or today if no value is provided.' })                    from : Date | undefined,
    @Arg("to"  , { nullable: true, description: 'The end date, or a week from the start date if no value is provided.' }) to   : Date | undefined,
  ): ScheduleDay[] {
    if (!from) {
      from = new Date()
      from = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    }
    if (!to) {
      to = new Date(from.valueOf() + 3_600_000 * 24 * 2)
    }

    return group.schedule.filter(x => x.dayStart >= from && x.dayEnd <= to)
  }

  @Query(returns => ServerStatus, { description: 'Returns the current status of the server.' })
  status(): ServerStatus {
    const status = new ServerStatus()

    status.loading = this.db.isLoading
    status.lastUpdateStartTime = this.db.startedLoading
    status.lastUpdateEndTime = this.db.finishedLoading

    return status
  }
}
