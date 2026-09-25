using FactoryBrain.Api.Domain.Entities;
using FactoryBrain.Api.Domain.Enums;
using FactoryBrain.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace FactoryBrain.Api.Data;

/// <summary>
/// Idempotent data seeder. Mirrors every record under
/// <c>src/data/*.ts</c> so the frontend sees the exact same widgets, counts
/// and ordering when it talks to ASP.NET Core.
/// </summary>
public static class DbInitializer
{
    /// <summary>
    /// Convenience entry point invoked from <c>Program.cs</c> on startup.
    /// Pulls a scoped <see cref="FactoryBrainDbContext"/> + <see cref="IRagService"/>
    /// out of the root provider and runs the full seed pass.
    /// </summary>
    public static async Task Initialize(IServiceProvider sp, CancellationToken ct = default)
        => await SeedAsync(sp, ct);

    public static async Task SeedAsync(IServiceProvider sp, CancellationToken ct = default)
    {
        await using var scope = sp.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FactoryBrainDbContext>();
        var rag = scope.ServiceProvider.GetRequiredService<IRagService>();

        await SeedAgentsAsync(db, ct);
        await SeedPoliciesAsync(db, ct);
        await SeedManualsAsync(db, rag, ct);
        await SeedLineBoardAsync(db, ct);
        await SeedSensorReadingsAsync(db, ct);
        await SeedQcDefectsAsync(db, ct);
        await SeedFloorAlertsAsync(db, ct);
        await SeedOrdersAndInventoryAsync(db, ct);
    }

    // --- agents -----------------------------------------------------------
    private static async Task SeedAgentsAsync(FactoryBrainDbContext db, CancellationToken ct)
    {
        if (await db.Agents.AnyAsync(ct)) return;

        db.Agents.AddRange(
            new AgentDefinition
            {
                Id = "line-throughput-agent",
                Name = "Line Efficiency Agent",
                NameBn = "লাইন দক্ষতা এজেন্ট",
                Purpose =
                    "Reads line and order data, computes efficiency against target, and names the bottleneck operation dragging the line down.",
                PurposeBn =
                    "লাইন ও অর্ডার ডেটা পড়ে লক্ষ্যমাত্রার বিপরীতে দক্ষতা গণনা করে এবং লাইনকে পিছিয়ে রাখা বটলনেক অপারেশন চিহ্নিত করে।",
                Risk = RiskTier.Low,
                Execution = "auto",
                Model = "Mid-tier reasoning (GPT-4.1-mini / Claude Sonnet small)",
                ContextSlices = new() { "lines", "orders", "targets" },
                Status = "ready",
                TasksToday = 14,
                RecentCount = 187,
                Glyph = "line-throughput"
            },
            new AgentDefinition
            {
                Id = "maintenance-agent",
                Name = "Maintenance & Uptime Agent",
                NameBn = "মেইনটেন্যান্স ও আপটাইম এজেন্ট",
                Purpose =
                    "Reads machine sensor data (vibration, temperature, duty cycle) and flags machines trending toward failure before they go down.",
                PurposeBn =
                    "মেশিনের সেন্সর ডেটা (কম্পন, তাপমাত্রা, ডিউটি সাইকেল) পড়ে ব্যর্থতার দিকে এগোচ্ছে এমন মেশিন আগেই চিহ্নিত করে।",
                Risk = RiskTier.Medium,
                Execution = "auto_suggest_with_threshold",
                Model = "Mid-tier reasoning + structured threshold checks (GPT-4.1-mini)",
                ContextSlices = new() { "machines", "lines" },
                Status = "ready",
                TasksToday = 8,
                RecentCount = 92,
                Glyph = "maintenance"
            },
            new AgentDefinition
            {
                Id = "manager-agent",
                Name = "Manager Orchestrator Agent",
                NameBn = "ম্যানেজার অর্কেস্ট্রেটর এজেন্ট",
                Purpose =
                    "Routes free-text factory-floor questions to the right sub-agent and generates the daily brief (overnight efficiency, downtime, today's shipment risk) on demand.",
                PurposeBn =
                    "মুক্ত-পাঠ্য কারখানা-তল প্রশ্নগুলো সঠিক সাব-এজেন্টে রাউট করে এবং চাহিদা অনুযায়ী দৈনিক ব্রিফ (রাতের দক্ষতা, ডাউনটাইম, আজকের শিপমেন্ট ঝুঁকি) তৈরি করে।",
                Risk = RiskTier.Low,
                Execution = "auto",
                Model = "Frontier-tier routing + summarisation (Claude Sonnet / GPT-4.1)",
                ContextSlices = new() { "*" },
                Status = "ready",
                TasksToday = 22,
                RecentCount = 248,
                Glyph = "orchestrator"
            });

        await db.SaveChangesAsync(ct);
    }

    // --- policies ---------------------------------------------------------
    private static async Task SeedPoliciesAsync(FactoryBrainDbContext db, CancellationToken ct)
    {
        if (await db.Policies.AnyAsync(ct)) return;
        db.Policies.AddRange(
            new PolicyDocument
            {
                Id = "policy:return-1",
                Title = "Return Policy (BD)",
                TitleBn = "পণ্য ফেরত নীতি (বাংলাদেশ)",
                Type = "return",
                EffectiveDate = new DateTime(2025, 11, 1),
                Body = "Customers may return unworn, unused items within 7 days of delivery for a full refund. " +
                       "Returned items must include original packaging. Perishable grocery items are not returnable " +
                       "unless damaged in transit. Refunds are issued to the original payment method within 5 business " +
                       "days of receiving the returned item. Return shipping is paid by the customer except in cases of our error.",
                BodyBn = "গ্রাহকরা ডেলিভারির ৭ দিনের মধ্যে অব্যবহৃত পণ্য ফেরত দিয়ে সম্পূর্ণ রিফান্ড পেতে পারেন। " +
                         "ফেরত পণ্যসামগ্রীর সাথে মূল প্যাকেজিং থাকতে হবে।"
            },
            new PolicyDocument
            {
                Id = "policy:supplier-agreement-1",
                Title = "Supplier Agreement — Narayanganj Textiles & Sylhet Tea & Beauty",
                TitleBn = "সরবরাহকারী চুক্তি — নারায়ণগঞ্জ টেক্সটাইল ও সিলেট চা",
                Type = "supplier-agreement",
                EffectiveDate = new DateTime(2025, 8, 15),
                Body = "Standard supplier agreement: 30-day payment terms, 2% early-payment discount within 7 days. " +
                       "Quality acceptance window: 5 days from delivery. Rejection requires photographic evidence.",
                BodyBn = "স্ট্যান্ডার্ড সরবরাহকারী চুক্তি: ৩০ দিনের পেমেন্ট শর্ত, ৭ দিনের মধ্যে ২% আগাম পেমেন্ট ছাড়।"
            });
        await db.SaveChangesAsync(ct);
    }

    // --- manuals + chunks (RAG index) -----------------------------------
    private static async Task SeedManualsAsync(
        FactoryBrainDbContext db, IRagService rag, CancellationToken ct)
    {
        if (await db.ManualDocuments.AnyAsync(ct)) return;

        var seeds = new (string TitleEn, string TitleBn, string[] Tags, string BodyEn, string BodyBn, string Source, string Dept, string Cat)[]
        {
            ("Bearing care checklist (sewing machines)",
             "বিয়ারিং কেয়ার চেকলিস্ট (সেলাই মেশিন)",
             new[]{"maintenance","sewing","bearing"},
             "Weekly: check bearing temperature and vibration RMS with the handheld probe. Quarterly: re-grease with NLGI #2 lithium. Replace the bearing when vibration exceeds 4.5 mm/s or temperature crosses 75 °C for more than 30 minutes.",
             "সাপ্তাহিক: হ্যান্ডহেল্ড প্রোব দিয়ে বিয়ারিং তাপমাত্রা এবং কম্পন RMS পরীক্ষা করুন। ত্রৈমাসিক: NLGI #২ লিথিয়াম দিয়ে পুনর্গ্রিস করুন।",
             "manual","sewing","manuals"),
            ("Line 3 efficiency decline — investigations",
             "লাইন ৩ দক্ষতা হ্রাস — তদন্ত",
             new[]{"line-3","efficiency","investigation"},
             "Sustained 12–18% dip vs target over the last 4 hours. Check sewing helper allocation first, then QC backlog. Sensor log pattern: bundle_scan rate dropped from 18 to 11/min between 09:00–11:00.",
             "গত ৪ ঘন্টায় লক্ষ্যের তুলনায় টানা ১২–১৮% হ্রাস। প্রথমে সেলাই সহায়ক বরাদ্দ, তারপর QC ব্যাকলগ পরীক্ষা করুন।",
             "sensor_log","sewing","manuals"),
            ("Buttonhole machine — calibration",
             "বোতামের ছিদ্র মেশিন — ক্যালিব্রেশন",
             new[]{"finishing","buttonhole","calibration"},
             "Cutter blade tension target: 2.4 N·m. Re-calibrate after every 5,000 cycles. When binding rate exceeds 2% over a shift, pull two random samples and inspect under the loupe.",
             "কাটার ব্লেড টেনশন লক্ষ্য: ২.৪ N·m। প্রতি ৫,০০০ সাইকেলের পর পুনঃক্যালিব্রেট করুন।",
             "manual","finishing","manuals"),
            ("Bundles per minute — target table by SMV",
             "বান্ডল প্রতি মিনিট — SMV অনুযায়ী লক্ষ্য",
             new[]{"throughput","sah","smv"},
             "Standard SAH target: 22 bundles/min at SMV 0.45, scaling linearly to 13 bundles/min at SMV 0.75. If observed rate is below 80% of target for 30+ minutes, pull helper allocation from Finishing and rebalance to Sewing.",
             "স্ট্যান্ডার্ড SAH লক্ষ্য: SMV ০.৪৫ এ ২২ বান্ডল/মিনিট, SMV ০.৭৫ এ রৈখিকভাবে ১৩ বান্ডল/মিনিট।",
             "manual","sewing","manuals"),
            ("Energy spike on Line 4 compressor — log",
             "লাইন ৪ কম্প্রেসর শক্তি স্পাইক — লগ",
             new[]{"line-4","energy","compressor"},
             "Energy meter on compressor Line 4: 22% above 7-day rolling average. Peak demand 165 kW vs baseline 130 kW. Pattern starts after 14:00 daily — correlate with finishing-station dryer cycle.",
             "কম্প্রেসর লাইন ৪ এর শক্তি মিটার: ৭ দিনের চলমান গড়ের চেয়ে ২২% বেশি। পিক ডিমান্ড ১৬৫ kW বনাম বেসলাইন ১৩০ kW।",
             "sensor_log","sewing","sop"),
            ("QC reject categories & thresholds",
             "QC প্রত্যাখ্যান বিভাগ ও থ্রেশহোল্ড",
             new[]{"qc","rejects","defects"},
             "Reject categories: stitch skip (> 3 mm gap), open seam (> 5 mm), oil stain (> 5 mm), shading, measurement out-of-tolerance (> 4 mm). If a category spikes by >25% week-on-week, file a defect cluster insight and reroute the next two PO bundles to inline QC.",
             "প্রত্যাখ্যান বিভাগ: সেলাই বাদ (> ৩ মিমি ফাঁক), খোলা সিম (> ৫ মিমি), তেলের দাগ (> ৫ মিমি)।",
             "manual","qc","qc"),
            ("Cutting table — fabric relaxation time",
             "কাটিং টেবিল — কাপড় রিল্যাক্সেশন সময়",
             new[]{"cutting","fabric","preparation"},
             "Allow knit fabric to relax for 12–24 hours before cutting. Shrinkage of 3–5% is expected. Spreading on the cutting table: align selvage, face up for the top ply, and pre-spot any knot/stain.",
             "কাটিংয়ের আগে নিট কাপড়কে ১২–২৪ ঘন্টা রিল্যাক্স করতে দিন। ৩–৫% সংকোচন প্রত্যাশিত।",
             "manual","cutting","sop"),
            ("M-101 vibration trend — last 24h",
             "M-101 কম্পন প্রবণতা — শেষ ২৪ ঘন্টা",
             new[]{"m-101","machine","vibration","investigation"},
             "Vibration RMS on M-101 climbed from 2.1 mm/s (06:00) to 3.9 mm/s (17:00). Temperature stable at 64 °C. Noise floor unchanged. Likely cause: feed dog wear — schedule bearing inspection within 72h.",
             "M-101 এ কম্পন RMS ০৬:০০ এ ২.১ mm/s থেকে ১৭:০০ এ ৩.৯ mm/s এ উঠেছে। তাপমাত্রা ৬৪°C এ স্থিতিশীল।",
             "sensor_log","sewing","manuals"),
        };

        int idx = 1;
        foreach (var s in seeds)
        {
            var docId = $"doc-{idx++}";
            var doc = new ManualDocument
            {
                Id = docId,
                TitleEn = s.TitleEn,
                TitleBn = s.TitleBn,
                Tags = s.Tags.ToList(),
                BodyEn = s.BodyEn,
                BodyBn = s.BodyBn,
                Source = s.Source,
                Department = s.Dept,
                Category = s.Cat
            };
            var chunks = await rag.ChunkAsync(docId, s.TitleEn, s.BodyEn, s.Tags, s.Dept, s.Cat, ct);
            foreach (var c in chunks) doc.Chunks.Add(c);
            db.ManualDocuments.Add(doc);
        }
        await db.SaveChangesAsync(ct);
    }

    // --- line-board -------------------------------------------------------
    private static async Task SeedLineBoardAsync(FactoryBrainDbContext db, CancellationToken ct)
    {
        if (await db.LineBoardMetrics.AnyAsync(ct)) return;
        var rng = new Random(0xBEEF);
        var seeds = new (string Id, string Name, int Target)[]
        {
            ("line-1", "Line 1 — Polo Tee", 70),
            ("line-2", "Line 2 — Crew Neck", 70),
            ("line-3", "Line 3 — V-Neck", 78),
            ("line-4", "Line 4 — Hoodie", 70),
            ("line-5", "Line 5 — Tank Top", 70),
            ("line-6", "Line 6 — Jacket", 70),
        };
        foreach (var s in seeds)
        {
            int eff = 50 + rng.Next(40);
            int wip = 100 + rng.Next(220);
            int npt = 10 + rng.Next(60);
            var bn = (eff < 50 || s.Target - eff >= 10) ? Bottleneck.Red :
                     (s.Target - eff >= 5) ? Bottleneck.Amber : Bottleneck.Green;
            db.LineBoardMetrics.Add(new LineBoardMetric
            {
                Id = s.Id,
                Name = s.Name,
                EfficiencyPct = eff,
                SahTarget = s.Target,
                SahActual = eff,
                WipBundles = wip,
                Bottleneck = bn,
                NptMinutes = npt,
                UpdatedAt = DateTime.UtcNow
            });
        }
        await db.SaveChangesAsync(ct);
    }

    // --- sensors ----------------------------------------------------------
    private static async Task SeedSensorReadingsAsync(FactoryBrainDbContext db, CancellationToken ct)
    {
        if (await db.SensorReadings.AnyAsync(ct)) return;
        var rng = new Random(0xC0FFEE);
        var profile = new (SensorSource Source, string Metric, string Unit, double Lo, double Hi, Func<Random, string> Entity)[]
        {
            (SensorSource.Rfid,      "scans_per_min", "scans/min", 8,   22,  _ => Pick(rng, "gate-A1","gate-A2","gate-B1","gate-C1")),
            (SensorSource.Rfid,      "miss_rate",     "%",         0,    6,  _ => Pick(rng, "gate-A1","gate-A2","gate-B1","gate-C1")),
            (SensorSource.Telemetry, "vibration_rms", "mm/s",     0.8, 4.5, _ => Pick(rng, "M-101","M-102","M-103","M-201","M-202","M-301","M-302")),
            (SensorSource.Telemetry, "temperature_c", "°C",       45,  82,  _ => Pick(rng, "M-101","M-102","M-103","M-201","M-202","M-301","M-302")),
            (SensorSource.Telemetry, "duty_cycle",    "%",        55,  95,  _ => Pick(rng, "M-101","M-102","M-103","M-201","M-202","M-301","M-302")),
            (SensorSource.Energy,    "kwh",           "kWh",      42,  78,  _ => Pick(rng, "meter:floor-1","meter:floor-2","meter:floor-3")),
            (SensorSource.Energy,    "peak_demand",   "kW",       110, 165, _ => Pick(rng, "meter:floor-1","meter:floor-2","meter:floor-3")),
        };

        var now = DateTime.UtcNow;
        int id = 1;
        for (int t = 0; t < 24; t++)
        {
            var ts = now.AddMinutes(-t);
            for (int k = 0; k < 3; k++)
            {
                var p = profile[rng.Next(profile.Length)];
                db.SensorReadings.Add(new SensorReading
                {
                    Id = $"seed-sensor-{id++}",
                    Source = p.Source,
                    EntityId = p.Entity(rng),
                    Metric = p.Metric,
                    Value = Math.Round(p.Lo + rng.NextDouble() * (p.Hi - p.Lo), 2),
                    Unit = p.Unit,
                    Ts = ts,
                    SimTick = t
                });
            }
        }
        await db.SaveChangesAsync(ct);
    }

    // --- QC defects (deterministic per-cell) ------------------------------
    private static readonly string[] Operations =
        { "cutting", "sewing", "buttonhole", "top_stitch", "qc_inspection", "finishing" };
    private static readonly string[] Lines =
        { "line-1", "line-2", "line-3", "line-4", "line-5", "line-6" };

    private static async Task SeedQcDefectsAsync(FactoryBrainDbContext db, CancellationToken ct)
    {
        if (await db.QcDefects.AnyAsync(ct)) return;

        var weekStarts = RecentWeekStarts(8);
        foreach (var op in Operations)
        {
            for (int lineIdx = 0; lineIdx < Lines.Length; lineIdx++)
            {
                var line = Lines[lineIdx];
                var rng = new Random((int)(0xDEFE0001 ^ (Array.IndexOf(Operations, op) * 0x9E37) ^ (lineIdx * 0x7F4A)));
                int inspTot = 0, defTot = 0, majTot = 0, minTot = 0, rewTot = 0;
                var cell = new QcDefect
                {
                    Id = $"{op}-{line}",
                    Operation = op,
                    LineId = line
                };
                for (int w = 0; w < weekStarts.Length; w++)
                {
                    int inspected = 1400 + (w % 4) * 40 + rng.Next(200) - (w * 17) % 60;
                    if (inspected < 0) inspected = 0;
                    double defectRate = Math.Max(0.005, 0.012 + Array.IndexOf(Operations, op) * 0.0037 + lineIdx * 0.0021 + (rng.NextDouble() - 0.5) * 0.012);
                    int defects = Math.Min(inspected, (int)Math.Round(inspected * defectRate));
                    double majorShare = Math.Clamp(0.30 + (rng.NextDouble() - 0.5) * 0.15, 0.05, 0.95);
                    int major = (int)Math.Round(defects * majorShare);
                    int minor = Math.Max(0, defects - major);
                    int rework = Math.Min(defects, (int)Math.Round(defects * (0.25 + (rng.NextDouble() - 0.5) * 0.1)));

                    cell.Weeks.Add(new QcDefectWeek
                    {
                        WeekStart = weekStarts[w],
                        Inspected = inspected,
                        Defects = defects,
                        Major = major,
                        Minor = minor,
                        Rework = rework
                    });
                    inspTot += inspected; defTot += defects; majTot += major; minTot += minor; rewTot += rework;
                }
                cell.InspectedTotal = inspTot;
                cell.DefectsTotal = defTot;
                cell.MajorTotal = majTot;
                cell.MinorTotal = minTot;
                cell.ReworkTotal = rewTot;
                db.QcDefects.Add(cell);
            }
        }
        await db.SaveChangesAsync(ct);
    }

    // --- floor alerts -----------------------------------------------------
    private static async Task SeedFloorAlertsAsync(FactoryBrainDbContext db, CancellationToken ct)
    {
        if (await db.FloorAlerts.AnyAsync(ct)) return;
        var rng = new Random(0xF100D);
        var tpls = new (FloorAlertSeverity Sev, string En, string Bn)[]
        {
            (FloorAlertSeverity.Warn,
             "Line {line} efficiency is {pct}% below target — review before the 10:00 standup.",
             "লাইন {line} এর দক্ষতা লক্ষ্যের চেয়ে {pct}% কম — ১০:০০ স্ট্যান্ডআপের আগে দেখুন।"),
            (FloorAlertSeverity.Critical,
             "Approval #{id} needs your sign-off — bearing replacement on {entity}.",
             "অনুমোদন #{id} আপনার স্বাক্ষরের অপেক্ষায় — {entity} এ বিয়ারিং প্রতিস্থাপন।"),
            (FloorAlertSeverity.Info,
             "Insight \"{title}\" was raised — open the brain feed for the full breakdown.",
             "\"{title}\" অন্তর্দৃষ্টি উত্থাপিত হয়েছে — বিস্তারিত জানতে ব্রেইন ফিড খুলুন।")
        };
        var lineLabels = new[] { "3", "5", "7" };
        var insightTitles = new[]
        {
            ("Two machines trending toward bearing wear", "দুটি মেশিন বিয়ারিং ক্ষয়ের দিকে এগোচ্ছে"),
            ("Line 3 slip — PO-4471 at risk", "লাইন ৩ বিলম্ব — PO-৪৪৭১ ঝুঁকিতে")
        };
        for (int i = 0; i < 6; i++)
        {
            var tpl = tpls[rng.Next(tpls.Length)];
            string en = tpl.En, bn = tpl.Bn;
            string? approvalId = null, insightId = null;
            if (tpl.Sev == FloorAlertSeverity.Critical)
            {
                approvalId = $"apr-{rng.Next(1000, 9999)}";
                en = en.Replace("{id}", approvalId[4..]).Replace("{entity}", $"M-{rng.Next(101, 310)}");
                bn = bn.Replace("{id}", approvalId[4..]).Replace("{entity}", $"M-{rng.Next(101, 310)}");
            }
            else if (tpl.Sev == FloorAlertSeverity.Info)
            {
                insightId = $"ins-{rng.Next(100, 999)}";
                var title = insightTitles[rng.Next(insightTitles.Length)];
                en = en.Replace("{title}", title.Item1);
                bn = bn.Replace("{title}", title.Item2);
            }
            else
            {
                en = en.Replace("{line}", lineLabels[rng.Next(lineLabels.Length)])
                        .Replace("{pct}", rng.Next(8, 22).ToString());
                bn = bn.Replace("{line}", lineLabels[rng.Next(lineLabels.Length)])
                        .Replace("{pct}", rng.Next(8, 22).ToString());
            }
            db.FloorAlerts.Add(new FloorAlert
            {
                Id = $"alert-{i + 1}",
                Channel = "whatsapp_sim",
                ApprovalId = approvalId,
                InsightId = insightId,
                BodyEn = en,
                BodyBn = bn,
                Severity = tpl.Sev,
                CreatedAt = DateTime.UtcNow.AddMinutes(-rng.Next(5, 240)),
                Read = rng.NextDouble() < 0.35
            });
        }
        await db.SaveChangesAsync(ct);
    }

    // --- orders / inventory placeholder -----------------------------------
    private static async Task SeedOrdersAndInventoryAsync(FactoryBrainDbContext db, CancellationToken ct)
    {
        if (await db.Products.AnyAsync(ct)) return;

        // Products (12 SKU seed)
        var products = new ProductRecord[]
        {
            new() { Id = "p-1", Sku = "APP-0042", Name = "Coral Apparel Pro", Category = "Apparel",  PriceBdt = 1899, CostBdt = 950, LeadTimeDays = 5 },
            new() { Id = "p-2", Sku = "APP-0103", Name = "Heritage Polo Tee",  Category = "Apparel",  PriceBdt = 1290, CostBdt = 640, LeadTimeDays = 5 },
            new() { Id = "p-3", Sku = "APP-0204", Name = "Dhaka Crew Neck",   Category = "Apparel",  PriceBdt = 1450, CostBdt = 720, LeadTimeDays = 5 },
            new() { Id = "p-4", Sku = "GRO-0117", Name = "Harvest Grocery Max", Category = "Grocery", PriceBdt = 720, CostBdt = 410, LeadTimeDays = 2 },
            new() { Id = "p-5", Sku = "BEA-0301", Name = "Sylhet Glow Serum",   Category = "Beauty",  PriceBdt = 2150, CostBdt = 980, LeadTimeDays = 3 },
            new() { Id = "p-6", Sku = "HOM-0411", Name = "Bengal Bamboo Mug",   Category = "Home",    PriceBdt = 650,  CostBdt = 260, LeadTimeDays = 7 },
        };
        db.Products.AddRange(products);

        // Customers (Bangladesh regions)
        db.Customers.AddRange(
            new CustomerRecord { Id = "c-1", Name = "Chowdhury Fashions",   Region = "Dhaka",      TotalOrders = 28, LtvBdt = 142_000, ChurnRisk = 0.12, LastOrderDays = 4 },
            new CustomerRecord { Id = "c-2", Name = "Latif Traders",        Region = "Chittagong", TotalOrders = 41, LtvBdt = 218_500, ChurnRisk = 0.31, LastOrderDays = 21 },
            new CustomerRecord { Id = "c-3", Name = "Sylhet Tea Co-op",     Region = "Sylhet",     TotalOrders = 19, LtvBdt =  88_900, ChurnRisk = 0.18, LastOrderDays = 9 },
            new CustomerRecord { Id = "c-4", Name = "Khulna Bricks",        Region = "Khulna",     TotalOrders =  7, LtvBdt =  39_400, ChurnRisk = 0.78, LastOrderDays = 78 },
            new CustomerRecord { Id = "c-5", Name = "Rajshahi Handicrafts", Region = "Rajshahi",   TotalOrders = 14, LtvBdt =  66_200, ChurnRisk = 0.55, LastOrderDays = 36 });

        // Suppliers
        db.Suppliers.AddRange(
            new SupplierRecord { Id = "s-1", Name = "Narayanganj Textiles", Region = "Dhaka",      LeadTimeDays = 7, OnTimeRate = 0.93 },
            new SupplierRecord { Id = "s-2", Name = "Sylhet Tea & Beauty",  Region = "Sylhet",     LeadTimeDays = 4, OnTimeRate = 0.88 },
            new SupplierRecord { Id = "s-3", Name = "Khulna Polymer Mills", Region = "Khulna",     LeadTimeDays = 9, OnTimeRate = 0.71 });

        // Inventory
        foreach (var p in products)
        {
            int stock = p.Sku is "APP-0042" or "GRO-0117" ? 40 : 600;
            double daily = p.Category == "Apparel" ? 8.5 : 2.1;
            int daysUntilStockout = Math.Max(0, (int)(stock / daily) - p.LeadTimeDays);
            db.Inventory.Add(new InventoryRecord
            {
                Id = $"inv-{p.Id}",
                ProductId = p.Id,
                Stock = stock,
                ReorderPoint = (int)Math.Round(daily * 14),
                ReorderQty = (int)Math.Round(daily * 30),
                DaysUntilStockout = daysUntilStockout,
                RecentDailyDemand = daily,
                AtRisk = daysUntilStockout < 14
            });
        }

        // Orders (sample rows — heavy dataset; full 14k rows generated lazily)
        var rng = new Random(0xF00D0001);
        string[] channels = { "shopify", "whatsapp", "facebook", "instagram", "direct" };
        for (int i = 0; i < 600; i++)
        {
            var p = products[rng.Next(products.Length)];
            int qty = rng.Next(1, 5);
            db.Orders.Add(new OrderRecord
            {
                Id = $"o-{(i + 1).ToString("D6")}",
                CustomerId = $"c-{rng.Next(1, 6)}",
                ProductId = p.Id,
                Quantity = qty,
                TotalBdt = p.PriceBdt * qty,
                Region = rng.NextDouble() > 0.6 ? "Dhaka" :
                         rng.NextDouble() > 0.5 ? "Chittagong" :
                         rng.NextDouble() > 0.5 ? "Sylhet" :
                         rng.NextDouble() > 0.5 ? "Khulna" : "Rajshahi",
                Channel = channels[rng.Next(channels.Length)],
                DaysAgo = rng.Next(0, 360)
            });
        }
        await db.SaveChangesAsync(ct);
    }

    // --- helpers ----------------------------------------------------------
    private static string Pick(Random r, params string[] xs) => xs[r.Next(xs.Length)];

    private static string[] RecentWeekStarts(int count)
    {
        var out0 = new List<string>();
        var d = DateTime.UtcNow;
        int offsetToMonday = (int)((d.DayOfWeek + 6) % 7);
        d = d.AddDays(-offsetToMonday);
        for (int i = 0; i < count; i++)
        {
            out0.Add(d.ToString("yyyy-MM-dd"));
            d = d.AddDays(-7);
        }
        return out0.ToArray();
    }
}
