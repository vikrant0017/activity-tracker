import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  ActivityIcon,
  ChartNoAxesCombinedIcon,
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
import { Label, Pie, PieChart } from "recharts"

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

type Page = "overview" | "focus" | "rules" | "activity"
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
type Dashboard = {
  theme?: OmarchyTheme
  kpis: {
    active_seconds: number
    idle_seconds: number
    average_window_seconds: number
    context_switch_count: number
  }
  top_sessions: { app: Session[]; app_title: Session[] }
  top_visits: { app: Visit[]; app_title: Visit[] }
  category_totals: Array<Category & { duration_seconds: number }>
  categories: Category[]
  category_rules: CategoryRule[]
  known_apps: string[]
  events: EventRecord[]
}

const navigation = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboardIcon },
  {
    id: "focus" as const,
    label: "Focus analysis",
    icon: ChartNoAxesCombinedIcon,
  },
  { id: "rules" as const, label: "Category rules", icon: FolderCogIcon },
  { id: "activity" as const, label: "Activity log", icon: ClipboardListIcon },
]
const pieColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
const chartConfig = { duration: { label: "Active time" } } satisfies ChartConfig

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

function FocusShareChart({ sessions }: { sessions: Session[] }) {
  const chartData = sessions.slice(0, 5).map((session, index) => ({
    ...session,
    duration: session.duration_seconds,
    fill: pieColors[index % pieColors.length],
  }))
  const total = chartData.reduce((sum, session) => sum + session.duration, 0)
  if (!chartData.length)
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        No focus sessions to visualise yet.
      </p>
    )
  return (
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
                formatDuration(Number(value)),
                String(name),
              ]}
            />
          }
        />
        <Pie
          data={chartData}
          dataKey="duration"
          nameKey="label"
          innerRadius={60}
          outerRadius={96}
          stroke="var(--card)"
          strokeWidth={4}
          isAnimationActive={false}
        >
          <Label
            value={formatDuration(total)}
            position="center"
            className="fill-foreground text-xl font-semibold"
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

function Overview({ dashboard }: { dashboard: Dashboard | null }) {
  return (
    <div className="flex flex-col gap-6">
      {dashboard ? (
        <>
          <section
            aria-label="Today’s activity"
            className="grid gap-3 sm:grid-cols-3"
          >
            <Metric
              icon={MonitorDotIcon}
              label="Idle time"
              value={formatDuration(dashboard.kpis.idle_seconds)}
              detail="Between active windows"
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
          <section className="grid gap-6 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Focus share</CardTitle>
                <CardDescription>
                  How the top applications divide your active time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FocusShareChart sessions={dashboard.top_sessions.app} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>What has your attention?</CardTitle>
                <CardDescription>
                  Your top applications by active time. Use Focus analysis for
                  the full breakdown.
                </CardDescription>
                <CardAction>
                  <Badge variant="secondary">Live</Badge>
                </CardAction>
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
        </>
      ) : (
        <section className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
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
        <CardTitle>Recent signals</CardTitle>
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
  const [page, setPage] = useState<Page>("overview")
  const [connection, setConnection] = useState<
    "connecting" | "live" | "offline"
  >("connecting")
  useEffect(() => {
    const controller = new AbortController()
    const refreshDashboard = async () => {
      try {
        const response = await fetch("/api/dashboard", {
          signal: controller.signal,
        })
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
    }

    void refreshDashboard()
    const interval = window.setInterval(() => void refreshDashboard(), 1_000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [])
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
    setDashboard((await response.json()) as Dashboard)
  }
  const pageContent =
    page === "overview" ? (
      <Overview dashboard={dashboard} />
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
