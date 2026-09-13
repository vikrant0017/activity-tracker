import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import {
  ActivityIcon,
  ClipboardListIcon,
  Clock3Icon,
  FolderCogIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  MonitorDotIcon,
  NetworkIcon,
  PencilIcon,
  PlusIcon,
  Repeat2Icon,
  TimerResetIcon,
  Trash2Icon,
} from "lucide-react"
import { Bar, BarChart, Label, Pie, PieChart, XAxis, YAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"


import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Page = "daily" | "focus" | "rules" | "activity" | "coach"
type Session = { label: string; duration_seconds: number }
type Visit = { label: string; visit_count: number }
type Category = { id: number; name: string }
type CategoryRule = {
  id: number
  app: string
  title_substring: string | null
  categories: Category[]
}
type EventRecord = {
  id: number
  recorded_at: string
  event: string
  data: string | null
}
type OmarchyTheme = { mode: "dark" | "light"; tokens: Record<string, string> }
type TimelineSegment = {
  app: string
  title: string
  started_at: string
  ended_at: string
  start_minute: number
  end_minute: number
  duration_seconds: number
  categories: Category[]
}
type Dashboard = {
  theme?: OmarchyTheme
  date: string
  is_today: boolean
  kpis: {
    active_seconds: number
    idle_seconds: number
    average_window_seconds: number
    context_switch_count: number
  }
  coach: {
    breaks: {
      enabled: boolean
      active_seconds: number
      active_after_seconds: number
      break_seconds: number
      snooze_seconds: number
      due: boolean
      snoozed_until: string | null
      notification_pending: boolean
    }
  }
  top_sessions: { app: Session[]; app_title: Session[] }
  top_visits: { app: Visit[]; app_title: Visit[] }
  hourly_activity: Array<{ hour: number; active_seconds: number }>
  timeline: TimelineSegment[]
  category_totals: Array<Category & { duration_seconds: number }>
  categories: Category[]
  category_rules: CategoryRule[]
  known_apps: string[]
  events: EventRecord[]
}

const navigation = [
  { id: "daily" as const, label: "Daily analytics", icon: LayoutDashboardIcon },
  { id: "coach" as const, label: "Break coach", icon: TimerResetIcon },
  { id: "rules" as const, label: "Category rules", icon: FolderCogIcon },
  { id: "activity" as const, label: "Activity log", icon: ClipboardListIcon },
]
const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
const pieColors = chartColors
const chartConfig = { active: { label: "Active time" } } satisfies ChartConfig

function applyOmarchyTheme(theme: OmarchyTheme | undefined) {
  if (!theme) return

  const root = document.documentElement
  root.style.colorScheme = theme.mode
  root.style.accentColor = theme.tokens.primary
  root.style.scrollbarColor = `${theme.tokens["muted-foreground"]} ${theme.tokens.background}`

  for (const [token, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--${token}`, value)
  }
}

const formatDuration = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds))
  return [Math.floor(value / 3600), Math.floor((value % 3600) / 60), value % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":")
}
const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
const formatDay = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(
    new Date(`${value}T12:00:00`)
  )
const localDay = () => {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${today.getFullYear()}-${month}-${day}`
}
const shiftDay = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function AppSidebar({
  page,
  onPageChange,
  connected,
}: {
  page: Page
  onPageChange: (page: Page) => void
  connected: boolean
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <ActivityIcon aria-hidden="true" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">Activity tracker</p>
            <p className="truncate text-xs text-muted-foreground">
              Personal monitor
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={page === item.id}
                    onClick={() => onPageChange(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center">
          <span
            className={
              connected
                ? "size-2 shrink-0 rounded-full bg-chart-2"
                : "size-2 shrink-0 rounded-full bg-muted-foreground"
            }
          />
          <span className="group-data-[collapsible=icon]:hidden">
            {connected ? "Listening for activity" : "Reconnecting"}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Clock3Icon
  label: string
  value: string | number
  detail: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon aria-hidden="true" />
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p
          className="truncate text-2xl font-semibold tracking-tight tabular-nums"
          title={String(value)}
        >
          {value}
        </p>
        <p
          className="mt-1 truncate text-xs text-muted-foreground"
          title={detail}
        >
          {detail}
        </p>
      </CardContent>
    </Card>
  )
}

function Overview({
  dashboard,
  selectedDate,
  onDateChange,
}: {
  dashboard: Dashboard | null
  selectedDate: string
  onDateChange: (date: string) => void
}) {
  const appColors = useMemo(() => {
    const apps = [...new Set(dashboard?.timeline.map((segment) => segment.app) ?? [])]
    return new Map(
      apps.map((app, index) => [app, chartColors[index % chartColors.length]])
    )
  }, [dashboard?.timeline])
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{dashboard ? formatDay(dashboard.date) : "Daily analytics"}</CardTitle>
          <CardDescription>Review one local calendar day at a time. Today updates live.</CardDescription>
          <CardAction>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onDateChange(shiftDay(selectedDate, -1))}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => onDateChange(shiftDay(selectedDate, 1))}>Next</Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input aria-label="Analytics date" className="w-auto" type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
          {!dashboard?.is_today && <Button variant="secondary" size="sm" onClick={() => onDateChange(localDay())}>Today</Button>}
          {dashboard?.is_today && <Badge>Live</Badge>}
        </CardContent>
      </Card>
      {dashboard ? (
        <>
          <section aria-label="Daily activity metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Clock3Icon} label="Active time" value={formatDuration(dashboard.kpis.active_seconds)} detail="Time in active windows" />
            <Metric
              icon={MonitorDotIcon}
              label="Hypridle idle time"
              value={formatDuration(dashboard.kpis.idle_seconds)}
              detail="Confirmed after the configured idle timeout"
            />
            <Metric
              icon={TimerResetIcon}
              label="Average window time"
              value={formatDuration(dashboard.kpis.average_window_seconds)}
              detail="Average active time per observed window"
            />
            <Metric
              icon={Repeat2Icon}
              label="Context switches"
              value={dashboard.kpis.context_switch_count}
              detail="Changes between distinct windows"
            />
          </section>
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Activity timeline</CardTitle>
                <CardDescription>
                  Applications in focus throughout the selected day.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="min-w-160">
                    <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                      {[0, 4, 8, 12, 16, 20, 24].map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}
                    </div>
                    <div className="relative h-18 rounded-md bg-muted" aria-label="Application activity timeline">
                      {dashboard.timeline.map((segment, index) => {
                        const left = Math.max(0, Math.min(100, (segment.start_minute / 1440) * 100))
                        const width = Math.max(0.4, ((segment.end_minute - segment.start_minute) / 1440) * 100)
                        const detail = [segment.app, segment.title, ...segment.categories.map((category) => category.name)].filter(Boolean).join(" — ")
                        return <div key={`${segment.started_at}-${index}`} className="absolute top-2 bottom-2 rounded-sm outline-hidden ring-offset-background focus-visible:ring-2" style={{ left: `${left}%`, width: `${width}%`, backgroundColor: appColors.get(segment.app) }} title={`${detail}: ${formatDuration(segment.duration_seconds)}`} tabIndex={0} aria-label={`${detail}, ${formatDuration(segment.duration_seconds)}`} />
                      })}
                    </div>
                  </div>
                </div>
                {!dashboard.timeline.length && <p className="py-8 text-center text-sm text-muted-foreground">No active windows were recorded for this day.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top applications</CardTitle>
                <CardDescription>
                  Ranked by active time for this day.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {dashboard.top_sessions.app
                    .slice(0, 5)
                    .map((session, index) => (
                      <div
                        key={session.label}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium">
                          {index + 1}
                        </span>
                        <p
                          className="min-w-0 flex-1 truncate text-sm font-medium"
                          title={session.label}
                        >
                          {session.label}
                        </p>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {formatDuration(session.duration_seconds)}
                        </span>
                      </div>
                    ))}
                  {!dashboard.top_sessions.app.length && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Waiting for your first active window.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Active time by hour</CardTitle><CardDescription>When activity occurred during the day.</CardDescription></CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <BarChart accessibilityLayer data={dashboard.hourly_activity}>
                    <XAxis dataKey="hour" tickFormatter={(hour) => `${String(hour).padStart(2, "0")}:00`} />
                    <YAxis tickFormatter={(seconds) => `${Math.round(Number(seconds) / 60)}m`} width={42} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => [formatDuration(Number(value)), "Active time"]} />} />
                    <Bar dataKey="active_seconds" fill="var(--chart-1)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Time by category</CardTitle><CardDescription>Categories can overlap when multiple rules match one activity.</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableCaption>{dashboard.category_totals.length ? "Categorised active time." : "Create category rules to see this breakdown."}</TableCaption>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Active time</TableHead></TableRow></TableHeader>
                  <TableBody>{dashboard.category_totals.slice(0, 8).map((category) => <TableRow key={category.id}><TableCell className="font-medium">{category.name}</TableCell><TableCell className="text-right font-mono tabular-nums">{formatDuration(category.duration_seconds)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <section className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </section>
      )}
    </div>
  )
}

function ActivityLog({ dashboard }: { dashboard: Dashboard | null }) {
  const recentEvents = dashboard?.events.slice(0, 8) ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Selected day signals</CardTitle>
        <CardDescription>
          The latest window contexts reported by Hyprland.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col" role="list">
          {recentEvents.map((event) => (
            <li
              key={event.id}
              className="flex gap-3 border-b py-2.5 first:pt-0 last:border-0 last:pb-0"
            >
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full bg-chart-1"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <time
                    dateTime={event.recorded_at}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatDate(event.recorded_at)}
                  </time>
                </div>
                <p className="mt-1 truncate text-sm" title={event.data || ""}>
                  {event.data || "—"}
                </p>
              </div>
            </li>
          ))}
          {!recentEvents.length && (
            <li className="py-10 text-center text-sm text-muted-foreground">
              Waiting for activity events…
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}

const breakGuideSteps = [
  {
    label: "Breathe slowly",
    instruction: "Sit comfortably. Inhale for four counts, then exhale gently for six.",
    share: 0.4,
    kind: "breathing",
  },
  {
    label: "Roll your shoulders",
    instruction: "Let your shoulders soften. Roll them up, back, and down at an easy pace.",
    share: 0.3,
    kind: "shoulders",
  },
  {
    label: "Reach and rest your eyes",
    instruction: "Stand if comfortable, reach overhead, then look at something far away and let your eyes rest.",
    share: 0.3,
    kind: "reach",
  },
] as const

function BreakGuideIllustration({ kind }: { kind: (typeof breakGuideSteps)[number]["kind"] }) {
  if (kind === "breathing") {
    return (
      <svg viewBox="0 0 160 160" className="break-stretch-illustration size-44" aria-hidden="true">
        <circle cx="80" cy="80" r="64" className="fill-muted" />
        <circle cx="80" cy="80" r="42" className="break-breathe-ring fill-primary" />
        <circle cx="80" cy="80" r="16" className="fill-primary-foreground" />
      </svg>
    )
  }
  if (kind === "shoulders") {
    return (
      <svg viewBox="0 0 160 160" className="size-44" aria-hidden="true">
        <circle cx="80" cy="32" r="17" className="fill-muted-foreground" />
        <path d="M48 132c5-42 17-62 32-62s27 20 32 62" className="fill-muted" />
        <path d="M38 82c14-18 30-22 42-12m42 12c-14-18-30-22-42-12" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-primary" />
        <path d="m40 70-3 14 14-3m69-11 3 14-14-3" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 160 160" className="break-stretch-illustration size-44" aria-hidden="true">
      <circle cx="80" cy="38" r="16" className="fill-muted-foreground" />
      <path d="M80 58v50m0-40L43 40m37 28 37-28M80 108l-25 37m25-37 25 37" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" className="text-primary" />
      <path d="M43 40V22m0 0-9 10m9-10 9 10m71 8V22m0 0-9 10m9-10 9 10" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
    </svg>
  )
}

function BreakGuide({
  dashboard,
  request,
}: {
  dashboard: Dashboard | null
  request: (path: string, method: "POST" | "PUT" | "DELETE", payload?: unknown) => Promise<void>
}) {
  const breaks = dashboard?.coach.breaks
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [outcome, setOutcome] = useState<"done" | "snooze" | null>(null)
  const [selectedExercise, setSelectedExercise] = useState("auto")
  const isDue = Boolean(breaks?.enabled && (breaks.due || breaks.notification_pending))
  const duration = breaks?.break_seconds ?? 0

  useEffect(() => {
    const previousTitle = document.title
    document.title = "Activity Tracker Break"
    void fetch("/api/coach/breaks/window", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    if (!isDue || outcome || duration <= 0) return
    const startedAt = Date.now()
    const update = () => setElapsedSeconds(Math.min(duration, (Date.now() - startedAt) / 1000))
    update()
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [duration, isDue, outcome])

  const progress = duration > 0 ? Math.min(1, elapsedSeconds / duration) : 0
  const stepIndex = progress < 0.4 ? 0 : progress < 0.7 ? 1 : 2
  const step = selectedExercise === "auto" ? breakGuideSteps[stepIndex] : breakGuideSteps[Number(selectedExercise)]
  const finish = async (action: "done" | "snooze") => {
    try {
      await request("/api/coach/breaks/action", "POST", { action })
      setOutcome(action)
    } catch {
      // The regular dashboard remains available as a recovery path if the local API is offline.
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-8" aria-labelledby="break-guide-title">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <Badge variant="secondary">Guided break</Badge>
          <CardTitle id="break-guide-title" className="text-3xl">Take a gentle pause</CardTitle>
          <CardDescription>Move only within a comfortable range. Stop if anything feels painful or dizzy.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 text-center">
          {!breaks ? (
            <Skeleton className="h-80 w-full" />
          ) : outcome ? (
            <>
              <div className="flex size-24 items-center justify-center rounded-full bg-muted text-4xl" aria-hidden="true">✓</div>
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold">{outcome === "done" ? "Break recorded" : "Break snoozed"}</h2>
                <p className="text-muted-foreground">{outcome === "done" ? "Nice work giving yourself a moment away." : "Your next reminder will arrive after the configured snooze."}</p>
              </div>
              <Button render={<a href="/" />}>Return to dashboard</Button>
            </>
          ) : !isDue ? (
            <>
              <div className="flex size-24 items-center justify-center rounded-full bg-muted text-4xl" aria-hidden="true">✓</div>
              <div className="flex flex-col gap-2"><h2 className="text-xl font-semibold">No break is waiting</h2><p className="text-muted-foreground">This guide is available when your break coach sends a reminder.</p></div>
              <Button render={<a href="/" />}>Open dashboard</Button>
            </>
          ) : (
            <>
              <BreakGuideIllustration kind={step.kind} />
              <ToggleGroup value={[selectedExercise]} onValueChange={(value) => setSelectedExercise(value[0] || "auto")} variant="outline" spacing={1}>
                <ToggleGroupItem value="auto">Guided</ToggleGroupItem>
                {breakGuideSteps.map((exercise, index) => <ToggleGroupItem key={exercise.kind} value={String(index)}>{exercise.label}</ToggleGroupItem>)}
              </ToggleGroup>
              <div className="flex flex-col gap-2">
                <p className="font-mono text-3xl tabular-nums">{formatDuration(Math.max(0, duration - elapsedSeconds))}</p>
                <h2 className="text-2xl font-semibold">{step.label}</h2>
                <p className="max-w-md text-muted-foreground">{step.instruction}</p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Break routine progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite">{progress >= 1 ? "Your timer is complete. Finish when you are ready." : `Step ${stepIndex + 1} of ${breakGuideSteps.length}`}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => setElapsedSeconds(0)}>Restart routine</Button>
                <Button onClick={() => void finish("done")}>Finish break</Button>
                <Button variant="outline" onClick={() => void finish("snooze")}>Snooze</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function BreakCoach({
  dashboard,
  request,
}: {
  dashboard: Dashboard | null
  request: (path: string, method: "POST" | "PUT" | "DELETE", payload?: unknown) => Promise<void>
}) {
  const breaks = dashboard?.coach.breaks
  if (!breaks) return <Skeleton className="h-72 w-full" />
  const settingsKey = [
    breaks.enabled,
    breaks.active_after_seconds,
    breaks.break_seconds,
    breaks.snooze_seconds,
  ].join(":")
  return <BreakCoachContent key={settingsKey} breaks={breaks} request={request} />
}

function BreakCoachContent({
  breaks,
  request,
}: {
  breaks: Dashboard["coach"]["breaks"]
  request: (path: string, method: "POST" | "PUT" | "DELETE", payload?: unknown) => Promise<void>
}) {
  const [enabled, setEnabled] = useState(breaks.enabled)
  const [activeAfter, setActiveAfter] = useState(String(breaks.active_after_seconds / 60))
  const [breakMinutes, setBreakMinutes] = useState(String(breaks.break_seconds / 60))
  const [snoozeMinutes, setSnoozeMinutes] = useState(String(breaks.snooze_seconds / 60))
  const [message, setMessage] = useState<string | null>(null)

  const progress = Math.min(100, (breaks.active_seconds / breaks.active_after_seconds) * 100)
  const submitSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await request("/api/coach/breaks", "PUT", {
        enabled,
        active_after_seconds: Number(activeAfter) * 60,
        break_seconds: Number(breakMinutes) * 60,
        snooze_seconds: Number(snoozeMinutes) * 60,
      })
      setMessage("Break coach settings saved.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save break coach settings.")
    }
  }
  const action = async (name: "done" | "snooze" | "disable") => {
    try {
      await request("/api/coach/breaks/action", "POST", { action: name })
      setMessage(name === "done" ? "Break recorded. Great work taking time away." : "Break coach updated.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update break coach.")
    }
  }

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Adaptive break coach</CardTitle>
          <CardDescription>
            Gentle prompts are based on focused active time, never time spent idle.
          </CardDescription>
          <CardAction>
            <Badge variant={breaks.enabled ? "default" : "secondary"}>
              {breaks.enabled ? "Enabled" : "Off"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {breaks.enabled ? (
            <>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Active time until your next break</span>
                <span className="font-mono tabular-nums">{formatDuration(breaks.active_seconds)} / {formatDuration(breaks.active_after_seconds)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`${Math.round(progress)} percent toward next break`}>
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              {breaks.snoozed_until && <Alert><AlertTitle>Reminder snoozed</AlertTitle><AlertDescription>Next prompt after {formatDate(breaks.snoozed_until)}.</AlertDescription></Alert>}
              {breaks.due && <Alert><AlertTitle>It is time for a break</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-2"><span>Move and rest your eyes for {formatDuration(breaks.break_seconds)}.</span><Button size="sm" onClick={() => void action("done")}>Done</Button><Button size="sm" variant="secondary" onClick={() => void action("snooze")}>Snooze</Button></AlertDescription></Alert>}
            </>
          ) : (
            <Alert><AlertTitle>You are in control</AlertTitle><AlertDescription>Enable the coach when you want gentle desktop and dashboard reminders.</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reminder settings</CardTitle><CardDescription>All settings stay on this device and can be changed at any time.</CardDescription></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void submitSettings(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="break-coach-enabled">Coach status</FieldLabel>
                <Button id="break-coach-enabled" type="button" variant={enabled ? "default" : "secondary"} onClick={() => setEnabled((value) => !value)}>{enabled ? "Enabled — click to turn off" : "Off — click to enable"}</Button>
              </Field>
              <Field>
                <FieldLabel htmlFor="active-after">Active minutes before reminder</FieldLabel>
                <Input id="active-after" type="number" min="1" step="1" value={activeAfter} onChange={(event) => setActiveAfter(event.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="break-minutes">Suggested break minutes</FieldLabel>
                <Input id="break-minutes" type="number" min="1" step="1" value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="snooze-minutes">Snooze minutes</FieldLabel>
                <Input id="snooze-minutes" type="number" min="1" step="1" value={snoozeMinutes} onChange={(event) => setSnoozeMinutes(event.target.value)} required />
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-2"><Button type="submit">Save settings</Button>{breaks.enabled && <Button type="button" variant="outline" onClick={() => void action("disable")}>Disable coach</Button>}</div>
            {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
          </form>
        </CardContent>
      </Card>
    </section>
  )
}

function Focus({ dashboard }: { dashboard: Dashboard | null }) {
  const [grouping, setGrouping] = useState<"app" | "app_title">("app")
  const [limit, setLimit] = useState("5")
  const [sort, setSort] = useState("high")
  const [metric, setMetric] = useState<"duration" | "visits">("duration")
  const ranking = useMemo(() => {
    if (!dashboard) return []
    const entries =
      metric === "duration"
        ? dashboard.top_sessions[grouping].map((session) => ({
            label: session.label,
            value: session.duration_seconds,
          }))
        : dashboard.top_visits[grouping].map((visit) => ({
            label: visit.label,
            value: visit.visit_count,
          }))
    const selected = entries.slice(0, Number(limit))
    if (sort === "low") return [...selected].sort((a, b) => a.value - b.value)
    if (sort === "label")
      return [...selected].sort((a, b) => a.label.localeCompare(b.label))
    return selected
  }, [dashboard, grouping, limit, metric, sort])
  const chartData = ranking.map((entry, index) => ({
    ...entry,
    fill: pieColors[index % pieColors.length],
  }))
  const total = ranking.reduce((sum, entry) => sum + entry.value, 0)
  const valueLabel = metric === "duration" ? "Active time" : "Visits"
  const formatValue =
    metric === "duration"
      ? formatDuration
      : (value: number) => `${value} ${value === 1 ? "visit" : "visits"}`

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Analysis mode</CardTitle>
          <CardDescription>
            Switch between time spent and how often a context was visited.
          </CardDescription>
          <CardAction>
            <Tabs
              value={metric}
              onValueChange={(value) => {
                setMetric(value as typeof metric)
                setSort("high")
              }}
            >
              <TabsList aria-label="Focus analysis mode">
                <TabsTrigger value="duration">Time</TabsTrigger>
                <TabsTrigger value="visits">Context switches</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="grouping">Group by</FieldLabel>
            <NativeSelect
              id="grouping"
              value={grouping}
              onChange={(event) =>
                setGrouping(event.target.value as typeof grouping)
              }
            >
              <NativeSelectOption value="app">Application</NativeSelectOption>
              <NativeSelectOption value="app_title">
                App + window title
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="limit">Show</FieldLabel>
            <NativeSelect
              id="limit"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            >
              <NativeSelectOption value="3">Top 3</NativeSelectOption>
              <NativeSelectOption value="5">Top 5</NativeSelectOption>
              <NativeSelectOption value="10">Top 10</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="sort">Order</FieldLabel>
            <NativeSelect
              id="sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <NativeSelectOption value="high">
                Most {metric === "duration" ? "time" : "visits"} first
              </NativeSelectOption>
              <NativeSelectOption value="low">
                Least {metric === "duration" ? "time" : "visits"} first
              </NativeSelectOption>
              <NativeSelectOption value="label">Name A–Z</NativeSelectOption>
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>
      <section className="grid gap-6 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              {metric === "duration" ? "Focus share" : "Context-switch share"}
            </CardTitle>
            <CardDescription>
              {metric === "duration"
                ? "Share of selected active time."
                : "Share of visits to selected contexts."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length ? (
              <ChartContainer
                config={chartConfig}
                className="mx-auto min-h-75 w-full max-w-md"
              >
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, name) => [
                          formatValue(Number(value)),
                          String(name),
                        ]}
                      />
                    }
                  />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={60}
                    outerRadius={96}
                    stroke="var(--card)"
                    strokeWidth={4}
                    isAnimationActive={false}
                  >
                    <Label
                      value={
                        metric === "duration"
                          ? formatDuration(total)
                          : `${total} visits`
                      }
                      position="center"
                      className="fill-foreground text-xl font-semibold"
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="py-20 text-center text-sm text-muted-foreground">
                No{" "}
                {metric === "duration" ? "focus sessions" : "context switches"}{" "}
                to visualise yet.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {metric === "duration"
                ? "Session ranking"
                : "Context-switch ranking"}
            </CardTitle>
            <CardDescription>
              {metric === "duration"
                ? "Active time by selected context."
                : "Times each selected context was visited."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>
                {ranking.length
                  ? `${valueLabel} ranked by the selected order.`
                  : "No active-window events recorded yet."}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Application / window</TableHead>
                  <TableHead className="text-right">{valueLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((entry) => (
                  <TableRow key={entry.label}>
                    <TableCell
                      className="max-w-0 truncate font-medium"
                      title={entry.label}
                    >
                      {entry.label}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatValue(entry.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function RuleDialog({
  dashboard,
  request,
  rule,
  trigger,
}: {
  dashboard: Dashboard
  request: (
    path: string,
    method: "POST" | "PUT",
    payload: unknown
  ) => Promise<void>
  rule?: CategoryRule
  trigger: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [app, setApp] = useState("")
  const [title, setTitle] = useState("")
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const selectedCategories = dashboard.categories.filter((category) =>
    categoryIds.includes(category.id)
  )

  function prepare() {
    setApp(rule?.app ?? "")
    setTitle(rule?.title_substring ?? "")
    setCategoryIds(rule?.categories.map((category) => category.id) ?? [])
    setMessage("")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!categoryIds.length) {
      setMessage("Select at least one category.")
      return
    }
    setSaving(true)
    try {
      await request(
        rule ? `/api/category-rules/${rule.id}` : "/api/category-rules",
        rule ? "PUT" : "POST",
        {
          app,
          title_substring: title,
          category_ids: categoryIds,
        }
      )
      setOpen(false)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save rule."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) prepare()
        setOpen(nextOpen)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "Create rule"}</DialogTitle>
          <DialogDescription>
            Match an application and optional window-title text, then assign the
            activity to one or more categories.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={rule ? `rule-app-${rule.id}` : "rule-app"}>
                Application class
              </FieldLabel>
              <Combobox
                items={dashboard.known_apps}
                value={app}
                onValueChange={(value) => setApp(value ?? "")}
              >
                <ComboboxInput
                  id={rule ? `rule-app-${rule.id}` : "rule-app"}
                  className="w-full"
                  placeholder="Search or type an application class"
                  required
                />
                <ComboboxContent>
                  <ComboboxEmpty>No matching applications.</ComboboxEmpty>
                  <ComboboxList>
                    {(knownApp) => (
                      <ComboboxItem key={knownApp} value={knownApp}>
                        {knownApp}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldDescription>
                You can type a new class even when it has not been observed yet.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel
                htmlFor={rule ? `rule-title-${rule.id}` : "rule-title"}
              >
                Title contains
              </FieldLabel>
              <Input
                id={rule ? `rule-title-${rule.id}` : "rule-title"}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Optional title keyword"
              />
            </Field>
            <Field>
              <FieldLabel>Categories</FieldLabel>
              <Combobox
                items={dashboard.categories}
                itemToStringValue={(category) => category.name}
                multiple
                value={selectedCategories}
                onValueChange={(categories) =>
                  setCategoryIds(categories.map((category) => category.id))
                }
              >
                <ComboboxChips className="w-full">
                  <ComboboxValue>
                    {selectedCategories.map((category) => (
                      <ComboboxChip key={category.id}>
                        {category.name}
                      </ComboboxChip>
                    ))}
                  </ComboboxValue>
                  <ComboboxChipsInput placeholder="Search categories" />
                </ComboboxChips>
                <ComboboxContent>
                  <ComboboxEmpty>No matching categories.</ComboboxEmpty>
                  <ComboboxList>
                    {(category) => (
                      <ComboboxItem key={category.id} value={category}>
                        {category.name}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldDescription>
                Search, select, or remove multiple categories without leaving
                the form.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {message && (
            <p className="text-xs text-destructive" role="status">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              <ListFilterIcon data-icon="inline-start" />
              {saving ? "Saving…" : rule ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Rules({
  dashboard,
  request,
}: {
  dashboard: Dashboard | null
  request: (
    path: string,
    method: "POST" | "PUT" | "DELETE",
    payload?: unknown
  ) => Promise<void>
}) {
  const [newCategory, setNewCategory] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await request("/api/categories", "POST", { name: newCategory })
      setNewCategory("")
      setMessage("Category created.")
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create category."
      )
    } finally {
      setSaving(false)
    }
  }

  const actions = dashboard && (
    <div className="flex flex-wrap gap-2">
      <RuleDialog
        dashboard={dashboard}
        request={request}
        trigger={
          <Button>
            <PlusIcon data-icon="inline-start" />
            New rule
          </Button>
        }
      />
      <Dialog>
        <DialogTrigger render={<Button variant="outline" />}>
          <PlusIcon data-icon="inline-start" />
          New category
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create category</DialogTitle>
            <DialogDescription>
              Add a category, then use it in a rule.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={submitCategory}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="category-name">Category name</FieldLabel>
                <Input
                  id="category-name"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  required
                  placeholder="e.g. Deep work"
                />
              </Field>
            </FieldGroup>
            {message && (
              <p className="text-xs text-muted-foreground" role="status">
                {message}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {actions && <div className="flex justify-end">{actions}</div>}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.75fr)_minmax(28rem,1.25fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Time by category</CardTitle>
            <CardDescription>
              Only activity that matches a rule is shown here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>
                {dashboard?.category_totals.length
                  ? "Categorised focus time."
                  : "Create a rule to categorise activity."}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Active time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard?.category_totals.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
                      {category.name}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatDuration(category.duration_seconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saved rules</CardTitle>
            <CardDescription>
              Review, edit, or remove the rules that classify your activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>
                {dashboard?.category_rules.length
                  ? "Rules are evaluated against incoming activity."
                  : "No rules saved yet."}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard?.category_rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <p className="font-medium">{rule.app}</p>
                      <p className="text-xs text-muted-foreground">
                        {rule.title_substring
                          ? `Title contains “${rule.title_substring}”`
                          : "Every window title"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {rule.categories.map((category) => (
                          <Badge key={category.id} variant="secondary">
                            {category.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <RuleDialog
                          dashboard={dashboard}
                          request={request}
                          rule={rule}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Edit rule for ${rule.app}`}
                            >
                              <PencilIcon />
                            </Button>
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove rule for ${rule.app}`}
                          onClick={() =>
                            request(
                              `/api/category-rules/${rule.id}`,
                              "DELETE"
                            ).catch((error: unknown) =>
                              setMessage(
                                error instanceof Error
                                  ? error.message
                                  : "Unable to remove rule."
                              )
                            )
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {message && (
              <p className="mt-3 text-xs text-muted-foreground" role="status">
                {message}
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [page, setPage] = useState<Page>("daily")
  const [selectedDate, setSelectedDate] = useState(localDay)
  const [connection, setConnection] = useState<
    "connecting" | "live" | "offline"
  >("connecting")
  const refreshDashboard = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/dashboard?date=${encodeURIComponent(selectedDate)}`, { signal })
      if (!response.ok) throw new Error("Unable to load dashboard")
      const nextDashboard = (await response.json()) as Dashboard
      applyOmarchyTheme(nextDashboard.theme)
      setDashboard(nextDashboard)
      setConnection("live")
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== "AbortError") {
        setConnection("offline")
      }
    }
  }, [selectedDate])
  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => void refreshDashboard(controller.signal))
    const isClientToday = selectedDate === localDay()
    const interval = isClientToday
      ? window.setInterval(() => void refreshDashboard(), 1_000)
      : undefined
    return () => {
      controller.abort()
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [refreshDashboard, selectedDate])
  async function request(
    path: string,
    method: "POST" | "PUT" | "DELETE",
    payload?: unknown
  ) {
    const response = await fetch(path, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    })
    if (!response.ok) throw new Error(await response.text())
    await refreshDashboard()
  }
  const isBreakGuide = new URLSearchParams(window.location.search).has("break-guide")
  if (isBreakGuide) return <BreakGuide dashboard={dashboard} request={request} />
  const pageContent =
    page === "daily" ? (
      <Overview dashboard={dashboard} selectedDate={selectedDate} onDateChange={setSelectedDate} />
    ) : page === "coach" ? (
      <BreakCoach dashboard={dashboard} request={request} />
    ) : page === "focus" ? (
      <Focus dashboard={dashboard} />
    ) : page === "activity" ? (
      <ActivityLog dashboard={dashboard} />
    ) : (
      <Rules dashboard={dashboard} request={request} />
    )
  return (
    <SidebarProvider>
      <AppSidebar
        page={page}
        onPageChange={setPage}
        connected={connection === "live"}
      />
      <SidebarInset>
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
          href="#main-content"
        >
          Skip to content
        </a>
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 sm:px-6">
          <SidebarTrigger />
          <p className="text-sm text-muted-foreground">
            {navigation.find((item) => item.id === page)?.label}
          </p>
          <div className="ml-auto">
            <Badge
              variant={connection === "live" ? "default" : "secondary"}
              className="gap-2"
            >
              <span
                className={
                  connection === "live"
                    ? "size-1.5 rounded-full bg-primary-foreground"
                    : "size-1.5 rounded-full bg-muted-foreground"
                }
              />
              {connection === "live"
                ? "Live"
                : connection === "connecting"
                  ? "Connecting"
                  : "Reconnecting"}
            </Badge>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-[calc(100svh-3.5rem)] bg-muted/30 p-4 outline-none sm:p-6 lg:p-8"
        >
          {connection === "offline" && (
            <Alert className="mx-auto mb-6 max-w-6xl">
              <NetworkIcon aria-hidden="true" />
              <AlertTitle>Waiting for tracker connection</AlertTitle>
              <AlertDescription>
                The dashboard will reconnect automatically when the activity
                server is available.
              </AlertDescription>
            </Alert>
          )}
          <div className="mx-auto max-w-6xl">{pageContent}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
